// code/test/sim-assess.test.mjs: the miner's full answer for one subject (task4-miner-plan.md items 1-8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters } from "viem";
import { assess } from "../lib/sim-assess.mjs";
import { NO_POOL } from "../lib/sim-run.mjs";

const T = "0x5599811ff441f045d64cad51ce4d74462faf7a1d";
const FIELDS = ["subject", "verdict", "risk_score", "signals", "summary"];
const uint = (n) => encodeAbiParameters([{ type: "uint256" }], [n]);
// code: contract bytecode or "0x"; erc20: whether totalSupply() answers.
const rpcFor = ({ code = "0x6080", erc20 = true } = {}) => ({ async request(method) {
  if (method === "eth_getCode") return code;
  if (method === "eth_call") { if (!erc20) throw Object.assign(new Error("execution reverted"), { code: "reverted" }); return uint(1000n); }
  throw new Error(`unexpected ${method}`);
} });
const cleanSim = { block: 1, pool: "0xpool", buyOk: true, sellOk: true, buyTax: 0, transferTax: 0, sellTax: 0, revertReason: null };

test("the answer has exactly the intent's five fields, subject echoed", async () => {
  const a = await assess(`Is ${T} a scam?`, { rpc: rpcFor(), simulate: async () => cleanSim, realSells: async () => null });
  assert.deepEqual(Object.keys(a).sort(), [...FIELDS].sort());
  assert.equal(a.subject, `Is ${T} a scam?`);
  assert.equal(a.verdict, "LOW");
});
test("out-of-scope subjects are INCONCLUSIVE 0.5 without touching the RPC", async () => {
  const rpc = { async request() { throw new Error("must not be called"); } };
  for (const s of ["192.168.0.1", `${T} on base`, ""]) {
    const a = await assess(s, { rpc, simulate: async () => cleanSim, realSells: async () => null });
    assert.deepEqual([a.verdict, a.risk_score], ["INCONCLUSIVE", 0.5], s);
    assert.match(a.summary, /Ethereum ERC-20 token addresses only/);
  }
});
test("an address with no code (a wallet) is INCONCLUSIVE: not a contract", async () => {
  const a = await assess(T, { rpc: rpcFor({ code: "0x" }), simulate: async () => cleanSim, realSells: async () => null });
  assert.equal(a.verdict, "INCONCLUSIVE");
  assert.match(a.summary, /not a contract/i);
});
test("a wallet with an EIP-7702 delegation (code 0xef0100 + address) is still a wallet", async () => {
  const a = await assess(T, { rpc: rpcFor({ code: "0xef01005a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d" }), simulate: async () => cleanSim, realSells: async () => null });
  assert.equal(a.verdict, "INCONCLUSIVE");
  assert.match(a.summary, /not a contract/i);
});
test("a contract that is not an ERC-20 is INCONCLUSIVE", async () => {
  const a = await assess(T, { rpc: rpcFor({ erc20: false }), simulate: async () => cleanSim, realSells: async () => null });
  assert.equal(a.verdict, "INCONCLUSIVE");
  assert.match(a.summary, /not an ERC-20/i);
});
test("no V2-style pool: INCONCLUSIVE, says the pool type was not simulated", async () => {
  const a = await assess(T, { rpc: rpcFor(), simulate: async () => NO_POOL, realSells: async () => null });
  assert.equal(a.verdict, "INCONCLUSIVE");
  assert.match(a.summary, /pool type not simulated \(Uniswap V3\/V4 or other DEX\)/);
});
test("a sell revert asks for real sells; the block and pool are in the signals", async () => {
  let asked = null;
  const a = await assess(T, { rpc: rpcFor(), simulate: async () => ({ ...cleanSim, block: 26506539, pool: "0x1990", dex: "SushiSwap V2", sellOk: false, sellTax: 1, revertReason: "TRANSFER_FROM_FAILED" }),
    realSells: async (token, pool, block) => { asked = [token, pool, block]; return { realSells: 0, senders: 0 }; } });
  assert.deepEqual(asked, [T, "0x1990", 26506539]);
  assert.equal(a.verdict, "FRAUD");
  assert.ok(a.signals.includes("block: 26506539"));
  assert.ok(a.signals.includes("pool: SushiSwap V2 0x1990"));
  assert.ok(a.signals.includes("real sells in the last ~2,000 blocks: 0"));
});
test("a clean simulation does not spend time on the real-sell check", async () => {
  await assess(T, { rpc: rpcFor(), simulate: async () => cleanSim, realSells: async () => assert.fail("not needed") });
});
test("RPC outage propagates (the route turns it into a 503, so the caller is not billed)", async () => {
  const rpc = { async request() { throw Object.assign(new Error("all RPCs failed"), { code: "rpc_unavailable" }); } };
  await assert.rejects(assess(T, { rpc, simulate: async () => cleanSim, realSells: async () => null }), (e) => e.code === "rpc_unavailable");
});
