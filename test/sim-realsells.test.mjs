// code/test/sim-realsells.test.mjs: counting real sells from recorded pool logs (task4-miner-plan.md item 6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { countRealSells } from "../lib/sim-realsells.mjs";

const POOL = "0x1990d912c5f2bf8638a5bcd4ead66df9596bf851";
const tr = (tx, from) => ({ tx, from });
const sw = (tx, wethOut) => ({ tx, wethOut });

test("a transfer into the pool plus WETH paid out in the same tx is one real sell", () => {
  assert.deepEqual(countRealSells([tr("0xa", "0x01")], [sw("0xa", 5n)], POOL), { realSells: 1, senders: 1 });
});
test("buys (WETH out is 0) and transfers without a swap are not sells", () => {
  assert.deepEqual(countRealSells([tr("0xa", "0x01"), tr("0xb", "0x02")], [sw("0xa", 0n)], POOL), { realSells: 0, senders: 0 });
});
test("transfers from the pool itself are ignored; senders are counted once", () => {
  const r = countRealSells(
    [tr("0xa", "0x01"), tr("0xb", "0x01"), tr("0xc", "0x02"), tr("0xd", POOL)],
    [sw("0xa", 1n), sw("0xb", 1n), sw("0xc", 1n), sw("0xd", 1n)], POOL);
  assert.deepEqual(r, { realSells: 3, senders: 2 });
});
test("one tx with two transfers into the pool counts as one sell", () => {
  assert.deepEqual(countRealSells([tr("0xa", "0x01"), tr("0xa", "0x01")], [sw("0xa", 1n)], POOL), { realSells: 1, senders: 1 });
});
test("addresses compare case-insensitively", () => {
  assert.equal(countRealSells([tr("0xa", POOL.toUpperCase().replace("0X", "0x"))], [sw("0xa", 1n)], POOL).realSells, 0);
});
