// code/lib/sim-run.mjs: honeypot simulation for one Ethereum token, free (task4-miner-plan.md item 4).
// eth_simulateV1 runs every call from EOAs with state carried between calls, so no wallet, no funds, no helper
// contract, and msg.sender == tx.origin. Trades go through Uniswap V2 Router02 with the quote taken just before
// each swap in the same simulated state. Everything is pinned to the block read first.
import { decodeAbiParameters, decodeFunctionResult, encodeFunctionData, parseAbi, parseEther } from "viem";

export const RPCS = ["https://ethereum-rpc.publicnode.com", "https://1rpc.io/eth", "https://eth.drpc.org"];
export const NO_POOL = Object.freeze({ noPool: true });
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
// Uniswap V2-style DEXes, same Router02/pair interface; the first one with a WETH pair is used.
const DEXES = [
  { dex: "Uniswap V2", factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" },
  { dex: "SushiSwap V2", factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac", router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F" },
];
const A = "0x5eed000000000000000000000000000000000a01"; // buyer
const B = "0x5eed000000000000000000000000000000000b02"; // receives the transfer, then sells
const BUY = parseEther("0.01");
const DEADLINE = 9999999999n;

const router = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)", "function approve(address,uint256) returns (bool)"]);
const factory = parseAbi(["function getPair(address,address) view returns (address)"]);

export function decodeRevert(data) {
  if (!data || data === "0x") return "empty revert";
  if (data.startsWith("0x08c379a0")) {
    try { return decodeAbiParameters([{ type: "string" }], `0x${data.slice(10)}`)[0]; } catch { /* fall through */ }
  }
  if (data.startsWith("0x4e487b71")) return `panic ${BigInt(`0x${data.slice(10, 74) || "0"}`)}`;
  return `custom error ${data.slice(0, 10)}`;
}

// One attempt per RPC, in order. Any HTTP, network, timeout or JSON-RPC error (incl. method-not-found) moves on.
export function makeRpc(urls = RPCS, fetchImpl = fetch, timeoutMs = 8000) {
  return {
    async request(method, params) {
      for (const url of urls) {
        try {
          const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(timeoutMs) });
          if (!res.ok) continue;
          const j = await res.json();
          // A revert is the chain's answer (the same on every RPC), so it is final.
          if (j.error && (j.error.code === 3 || /revert/i.test(j.error.message ?? "")))
            throw Object.assign(new Error(j.error.message), { code: "reverted", data: j.error.data });
          if (j.error || j.result === undefined) continue;
          return j.result;
        } catch (e) {
          if (e.code === "reverted") throw e;
          /* otherwise: next RPC */
        }
      }
      throw Object.assign(new Error(`all RPCs failed for ${method}`), { code: "rpc_unavailable" });
    },
  };
}

const call = (from, to, abi, functionName, args, value) =>
  ({ from, to, data: encodeFunctionData({ abi, functionName, args }), ...(value ? { value: `0x${value.toString(16)}` } : {}) });
const ok = (c) => c?.status === "0x1";
const reason = (c) => decodeRevert(c?.error?.data ?? c?.returnData);
const uintOf = (c) => BigInt(c.returnData);
const lastAmount = (c) => decodeFunctionResult({ abi: router, functionName: "getAmountsOut", data: c.returnData }).at(-1);
// 1 - got/expected, rounded to 6 decimals, never negative (positive slippage is not a tax).
const tax = (got, expected) => (expected > 0n ? Math.max(0, Math.round((1 - Number((got * 1_000_000n) / expected) / 1e6) * 1e6) / 1e6) : 1);

export async function simulateToken(token, rpc) {
  const blockHex = await rpc.request("eth_blockNumber", []);
  let pool = null, dex = null, ROUTER = null;
  for (const d of DEXES) {
    const pairData = await rpc.request("eth_call", [{ to: d.factory, data: encodeFunctionData({ abi: factory, functionName: "getPair", args: [token, WETH] }) }, blockHex]);
    const p = decodeAbiParameters([{ type: "address" }], pairData)[0].toLowerCase();
    if (!/^0x0{40}$/.test(p)) { pool = p; dex = d.dex; ROUTER = d.router; break; }
  }
  if (!pool) return NO_POOL;

  const sim = async (calls) => {
    const res = await rpc.request("eth_simulateV1", [{ blockStateCalls: [{ stateOverrides: { [A]: { balance: `0x${parseEther("1").toString(16)}` } }, calls }], validation: false }, blockHex]);
    return res[0].calls;
  };
  const base = { block: Number(BigInt(blockHex)), pool, dex, buyOk: false, sellOk: false, buyTax: 0, transferTax: 0, sellTax: 0, revertReason: null };

  const buyCalls = [
    call(A, ROUTER, router, "getAmountsOut", [BUY, [WETH, token]]),
    call(A, ROUTER, router, "swapExactETHForTokensSupportingFeeOnTransferTokens", [0n, [WETH, token], A, DEADLINE], BUY),
    call(A, token, erc20, "balanceOf", [A]),
  ];
  const r1 = await sim(buyCalls);
  if (!ok(r1[1])) return { ...base, revertReason: reason(r1[1]) };
  const got = uintOf(r1[2]);
  const buyTax = tax(got, lastAmount(r1[0]));

  const transferCall = call(A, token, erc20, "transfer", [B, got]);
  const r2 = await sim([...buyCalls, transferCall, call(B, token, erc20, "balanceOf", [B])]);
  const transferred = ok(r2[3]);
  const transferTax = transferred ? tax(uintOf(r2[4]), got) : 1;

  // Sell from B after the transfer, or from A (the buyer) when transfers are blocked.
  const seller = transferred ? B : A;
  const amount = transferred ? uintOf(r2[4]) : got;
  const before = transferred ? [...buyCalls, transferCall, call(B, token, erc20, "balanceOf", [B])] : [...buyCalls, transferCall];
  const sellCalls = [...before,
    call(seller, token, erc20, "approve", [ROUTER, amount]),
    call(seller, ROUTER, router, "getAmountsOut", [amount, [token, WETH]]),
    call(seller, ROUTER, router, "swapExactTokensForTokensSupportingFeeOnTransferTokens", [amount, 0n, [token, WETH], seller, DEADLINE]),
    call(seller, WETH, erc20, "balanceOf", [seller]),
  ];
  const r3 = await sim(sellCalls);
  const i = before.length; // index of approve
  const sellOk = ok(r3[i + 2]);
  return { ...base, buyOk: true, sellOk, buyTax, transferTax,
    sellTax: sellOk ? tax(uintOf(r3[i + 3]), lastAmount(r3[i + 1])) : 1, revertReason: sellOk ? null : reason(r3[i + 2]) };
}
