// code/test/telegraph.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buy } from "../lib/telegraph.mjs";

const receipt = { receipt_hash: "0xr", tx_hash: "0xt", amount_uusdc: "10000" };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
const reply = ({ status = 200, header = b64(receipt), json = async () => ({ miner_name: "Cp Coinbase", result: { price_usd: 1 }, signal_hash: "0xs" }) } = {}) =>
  async () => ({ status, headers: { get: (h) => (h === "x-telegraph-receipt" ? header : null) }, json });

test("returns result, miner, receipt, signal and the receipt's exact cost on success", async () => {
  const r = await buy(reply(), { intent: "CRYPTO_PRICE_USD", params: { symbol: "BTC" } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.result, { price_usd: 1 });
  assert.equal(r.miner, "Cp Coinbase");
  assert.deepEqual(r.receipt, receipt);
  assert.equal(r.signal, "0xs");
  assert.equal(r.costUusdc, 10000);
});
test("an answer without a receipt has unknown cost (null), never a guessed 0.01", async () => {
  const r = await buy(reply({ header: null }), { intent: "X" });
  assert.equal(r.ok, true);
  assert.equal(r.costUusdc, null);
});
test("non-200 is a failure with the status in the error and unknown cost", async () => {
  const r = await buy(reply({ status: 500, header: null }), { intent: "X" });
  assert.equal(r.ok, false);
  assert.match(r.error, /500/);
  assert.equal(r.costUusdc, null);
});
test("a failure that still carries a receipt records what was charged", async () => {
  const r = await buy(reply({ status: 500 }), { intent: "X" });
  assert.equal(r.ok, false);
  assert.equal(r.costUusdc, 10000);
});
test("a bad receipt header does not fail a good answer", async () => {
  const r = await buy(reply({ header: "not-base64-json" }), { intent: "X" });
  assert.equal(r.ok, true);
  assert.equal(r.receipt, null);
  assert.equal(r.costUusdc, null);
  assert.match(r.note, /receipt/i);
});
test("a slow provider times out, the request is aborted, and the cost is unknown", async () => {
  let seen;
  const slow = (_u, init) => { seen = init.signal; return new Promise(() => {}); };
  const r = await buy(slow, { intent: "X" }, 20);
  assert.equal(r.ok, false);
  assert.match(r.error, /timeout/i);
  assert.equal(seen.aborted, true);
  assert.equal(r.costUusdc, null);
});
test("a body that never finishes also times out, keeping the receipt's cost", async () => {
  const r = await buy(reply({ json: () => new Promise(() => {}) }), { intent: "X" }, 20);
  assert.equal(r.ok, false);
  assert.match(r.error, /timeout/i);
  assert.equal(r.costUusdc, 10000);
});
test("a thrown error is a failure, not a crash", async () => {
  const r = await buy(async () => { throw new Error("network down"); }, { intent: "X" });
  assert.equal(r.ok, false);
  assert.match(r.error, /network down/);
});
test("node fallback (no miner answered, 'openai', no receipt, cost 0): flagged, not billed, value not trusted", async () => {
  const fb = async () => ({ status: 200, headers: { get: () => null }, json: async () => ({ miner_id: "openai", miner_name: "openai", cost_usd: 0, result: { price_usd: 1 }, signal_hash: "0xs" }) });
  const r = await buy(fb, { intent: "CRYPTO_PRICE_USD" });
  assert.equal(r.fallback, true);
  assert.equal(r.costUusdc, 0);
  assert.match(r.note, /node fallback 'openai'.*no Telegraph receipt.*not billed/);
  assert.equal(r.signal, "0xs");
});
test("a real miner's answer without a receipt is not mistaken for a fallback", async () => {
  const r = await buy(reply({ header: null }), { intent: "X" });
  assert.equal(r.fallback, false);
  assert.equal(r.costUusdc, null);
});
