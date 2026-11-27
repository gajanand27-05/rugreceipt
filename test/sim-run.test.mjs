// code/test/sim-run.test.mjs: RPC fallback, revert decoding and the buy/transfer/sell simulation (task4-miner-plan.md item 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeFunctionData, parseAbi } from "viem";
import { decodeRevert, makeRpc, simulateToken, NO_POOL } from "../lib/sim-run.mjs";

const json = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });

// --- revert decoding ---
test("Error(string) reverts decode to their message", () => {
  const data = encodeFunctionData({ abi: parseAbi(["function Error(string)"]), functionName: "Error", args: ["TRANSFER_FROM_FAILED"] });
  assert.equal(decodeRevert(data), "TRANSFER_FROM_FAILED");
});
test("custom errors give their selector, empty data says empty", () => {
  assert.equal(decodeRevert("0xdeadbeef00"), "custom error 0xdeadbeef");
  assert.equal(decodeRevert("0x"), "empty revert");
  assert.equal(decodeRevert(undefined), "empty revert");
});

// --- RPC fallback ---
test("method-not-found on the first RPC falls through to the next", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    const body = url === "https://a" ? { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "the method eth_simulateV1 does not exist" } }
      : { jsonrpc: "2.0", id: 1, result: "0x10" };
    return { ok: true, status: 200, json: async () => body };
  };
  const rpc = makeRpc(["https://a", "https://b"], fetchImpl);
  assert.equal(await rpc.request("eth_blockNumber", []), "0x10");
  assert.deepEqual(seen, ["https://a", "https://b"]);
});
test("HTTP errors and network errors fall through; all failing throws rpc_unavailable", async () => {
  const fetchImpl = async (url) => { if (url === "https://a") throw new Error("fetch failed"); return { ok: false, status: 525, json: async () => ({}) }; };
  const rpc = makeRpc(["https://a", "https://b"], fetchImpl);
  await assert.rejects(rpc.request("eth_blockNumber", []), (e) => e.code === "rpc_unavailable");
});
test("a JSON-RPC error other than method-not-found also falls through", async () => {
  let n = 0;
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => (n++ ? { result: "0x1" } : { error: { code: -32000, message: "rate limited" } }) });
  assert.equal(await makeRpc(["https://a", "https://b"], fetchImpl).request("eth_blockNumber", []), "0x1");
});

// --- simulation with a fake RPC ---
const uint = (n) => encodeAbiParameters([{ type: "uint256" }], [n]);
const amounts = (a, b) => encodeAbiParameters([{ type: "uint256[]" }], [[a, b]]);
const ok = (returnData = "0x") => ({ status: "0x1", returnData });
const fail = (msg) => ({ status: "0x0", returnData: encodeFunctionData({ abi: parseAbi(["function Error(string)"]), functionName: "Error", args: [msg] }) });
const PAIR = "0x00000000000000000000000000000000000000aa";

// The fake answers getPair and replies to each eth_simulateV1 by the number of calls it carries.
function fakeRpc({ pair = PAIR, replies }) {
  const calls = [];
  return {
    calls,
    async request(method, params) {
      calls.push(method);
      if (method === "eth_blockNumber") return "0x1000";
      if (method === "eth_call") return encodeAbiParameters([{ type: "address" }], [pair]);
      if (method === "eth_simulateV1") {
        const n = params[0].blockStateCalls[0].calls.length;
        assert.equal(params[1], "0x1000", "simulation pinned to the block read first");
        return [{ calls: replies[n] }];
      }
      throw new Error(`unexpected ${method}`);
    },
  };
}
// Call layout: [quoteBuy, buy, balA] -> [+transfer, balB] -> [+approve, quoteSell, sell, wethB]
const clean = {
  3: [ok(amounts(10n, 1000n)), ok(), ok(uint(1000n))],
  5: [ok(amounts(10n, 1000n)), ok(), ok(uint(1000n)), ok(), ok(uint(1000n))],
  9: [ok(amounts(10n, 1000n)), ok(), ok(uint(1000n)), ok(), ok(uint(1000n)), ok(), ok(amounts(1000n, 9n)), ok(), ok(uint(9n))],
};

test("a clean token: buy, transfer and sell succeed with zero taxes, block number reported", async () => {
  const r = await simulateToken("0x00000000000000000000000000000000000000tt".replace("tt", "11"), fakeRpc({ replies: clean }));
  assert.equal(r.block, 4096);
  assert.equal(r.pool, PAIR);
  assert.deepEqual({ buyOk: r.buyOk, sellOk: r.sellOk, buyTax: r.buyTax, transferTax: r.transferTax, sellTax: r.sellTax, revertReason: r.revertReason },
    { buyOk: true, sellOk: true, buyTax: 0, transferTax: 0, sellTax: 0, revertReason: null });
});
test("taxes are measured against the quote taken just before each swap", async () => {
  const taxed = {
    3: [ok(amounts(10n, 1000n)), ok(), ok(uint(950n))],
    5: [...clean[5].slice(0, 2), ok(uint(950n)), ok(), ok(uint(900n))],
    9: [...clean[9].slice(0, 2), ok(uint(950n)), ok(), ok(uint(900n)), ok(), ok(amounts(900n, 100n)), ok(), ok(uint(70n))],
  };
  const r = await simulateToken("0x0000000000000000000000000000000000000011", fakeRpc({ replies: taxed }));
  assert.equal(r.buyTax, 0.05);
  assert.ok(Math.abs(r.transferTax - (1 - 900 / 950)) <= 1e-6); // taxes are rounded to 6 decimals, like risk_score
  assert.equal(r.sellTax, 0.3);
});
test("a sell revert is reported with its decoded reason", async () => {
  const hp = { ...clean, 9: [...clean[9].slice(0, 7), fail("TRANSFER_FROM_FAILED"), ok(uint(0n))] };
  const r = await simulateToken("0x0000000000000000000000000000000000000011", fakeRpc({ replies: hp }));
  assert.equal(r.sellOk, false);
  assert.equal(r.revertReason, "TRANSFER_FROM_FAILED");
});
test("a buy revert stops the simulation: buyOk false, reason kept", async () => {
  const r = await simulateToken("0x0000000000000000000000000000000000000011",
    fakeRpc({ replies: { 3: [ok(amounts(10n, 1000n)), fail("Trading not open"), ok(uint(0n))] } }));
  assert.deepEqual([r.buyOk, r.sellOk, r.revertReason], [false, false, "Trading not open"]);
});
test("a blocked transfer is transfer tax 1, and the sell is still tested from the buyer", async () => {
  // layout when the transfer reverts: [quoteBuy, buy, balA, transfer(fail)] -> sell from A: [+approve, quoteSell, sell, wethA]
  const blocked = {
    3: clean[3],
    5: [...clean[5].slice(0, 3), fail("transfers disabled"), ok(uint(0n))],
    8: [...clean[3], fail("transfers disabled"), ok(), ok(amounts(1000n, 9n)), ok(), ok(uint(9n))],
  };
  const r = await simulateToken("0x0000000000000000000000000000000000000011", fakeRpc({ replies: blocked }));
  assert.deepEqual([r.transferTax, r.sellOk, r.sellTax], [1, true, 0]);
});
test("no V2 WETH pair: NO_POOL, nothing simulated", async () => {
  const rpc = fakeRpc({ pair: "0x0000000000000000000000000000000000000000", replies: {} });
  assert.equal(await simulateToken("0x0000000000000000000000000000000000000011", rpc), NO_POOL);
  assert.ok(!rpc.calls.includes("eth_simulateV1"));
});
