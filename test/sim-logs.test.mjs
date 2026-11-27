// code/test/sim-logs.test.mjs: fetching recent real sells from logs (task4-miner-plan.md item 6), with a fake RPC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, pad } from "viem";
import { fetchRealSells, TRANSFER_TOPIC, SWAP_TOPIC } from "../lib/sim-logs.mjs";

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const TOKEN = "0xffff000000000000000000000000000000000001"; // > WETH, so WETH is token0
const POOL = "0x00000000000000000000000000000000000000aa";
const topicAddr = (a) => pad(a, { size: 32 });
const transfer = (tx, from) => ({ transactionHash: tx, address: TOKEN, topics: [TRANSFER_TOPIC, topicAddr(from), topicAddr(POOL)], data: encodeAbiParameters([{ type: "uint256" }], [5n]) });
const swap = (tx, a0Out, a1Out) => ({ transactionHash: tx, address: POOL,
  topics: [SWAP_TOPIC, topicAddr("0x7a250d5630b4cf539739df2c5dacb4c659f2488d"), topicAddr("0x0000000000000000000000000000000000000009")],
  data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], [0n, 5n, a0Out, a1Out]) });

function fakeRpc(byChunk) {
  const ranges = [];
  return { ranges, async request(method, [f]) {
    assert.equal(method, "eth_getLogs");
    ranges.push([Number(f.fromBlock), Number(f.toBlock), f.topics[0] === TRANSFER_TOPIC ? "transfer" : "swap"]);
    const logs = byChunk[Number(f.toBlock)] ?? { transfer: [], swap: [] };
    return f.topics[0] === TRANSFER_TOPIC ? logs.transfer : logs.swap;
  } };
}

test("sells are transfers into the pool whose tx also paid WETH out (WETH = token0)", async () => {
  const rpc = fakeRpc({ 10000: { transfer: [transfer("0xa", "0x01"), transfer("0xb", "0x02"), transfer("0xc", "0x03")],
    swap: [swap("0xa", 7n, 0n), swap("0xb", 7n, 0n), swap("0xc", 0n, 7n)] } });
  assert.deepEqual(await fetchRealSells(TOKEN, POOL, rpc, 10000), { realSells: 2, senders: 2 });
});
test("WETH = token1 when the token address sorts first", async () => {
  const low = "0x0000000000000000000000000000000000000001";
  const rpc = fakeRpc({ 10000: { transfer: [transfer("0xa", "0x01")], swap: [swap("0xa", 0n, 7n)] } });
  assert.deepEqual(await fetchRealSells(low, POOL, rpc, 10000), { realSells: 1, senders: 1 });
});
test("walks back in 500-block chunks over ~2,000 blocks, newest first", async () => {
  const rpc = fakeRpc({});
  assert.deepEqual(await fetchRealSells(TOKEN, POOL, rpc, 10000), { realSells: 0, senders: 0 });
  const transfers = rpc.ranges.filter((r) => r[2] === "transfer").map((r) => r.slice(0, 2));
  assert.deepEqual(transfers, [[9501, 10000], [9001, 9500], [8501, 9000], [8001, 8500]]);
});
test("stops early once 3 sells from 2 senders are found", async () => {
  const rpc = fakeRpc({ 10000: { transfer: [transfer("0xa", "0x01"), transfer("0xb", "0x02"), transfer("0xc", "0x02")],
    swap: [swap("0xa", 1n, 0n), swap("0xb", 1n, 0n), swap("0xc", 1n, 0n)] } });
  assert.deepEqual(await fetchRealSells(TOKEN, POOL, rpc, 10000), { realSells: 3, senders: 2 });
  assert.equal(rpc.ranges.length, 2);
});
test("an RPC failure gives null (check unavailable), never a guess", async () => {
  const rpc = { async request() { throw Object.assign(new Error("all RPCs failed"), { code: "rpc_unavailable" }); } };
  assert.equal(await fetchRealSells(TOKEN, POOL, rpc, 10000), null);
});
