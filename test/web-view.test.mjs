import { test } from "node:test";
import assert from "node:assert/strict";
import { ROW_ORDER, rowsForDisplay, receiptUrl, verdictTone } from "../lib/web/view.mjs";

test("rowsForDisplay: fixed order, verdict rows first, placeholders for rows not back yet", () => {
  const out = rowsForDisplay([{ id: "holders", label: "Holders", state: "confirmed" }]);
  assert.deepEqual(out.map((r) => r.id), ROW_ORDER);
  assert.deepEqual(ROW_ORDER, ["liquidity", "holders", "price", "sanctions", "honeypot", "wash", "supply"]);
  assert.equal(out[1].state, "confirmed");
  assert.deepEqual(out[0], { id: "liquidity", label: "Pool liquidity", pending: true });
  assert.equal(out[6].label, "Total supply (on-chain)");
});

test("receiptUrl: Sepolia Etherscan tx link only when the receipt has a tx hash", () => {
  assert.equal(receiptUrl({ receipt: { tx_hash: "0xabc" } }), "https://sepolia.etherscan.io/tx/0xabc");
  assert.equal(receiptUrl({ receipt: {} }), null);
  assert.equal(receiptUrl({ receipt: null }), null);
});

test("receiptUrl: an escrow receipt (no tx) links to its delivery proof in the epoch block", () => {
  assert.equal(receiptUrl({ receipt: { rail: "escrow", receipt_hash: "0xrh", epoch_id: 20 } }),
    "https://devnode.telegraphprotocol.com/v1/blocks/20/deliveries/0xrh");
  assert.equal(receiptUrl({ receipt: { receipt_hash: "0xrh" } }), null);
});

test("verdictTone", () => {
  assert.equal(verdictTone("LIST"), "ok");
  assert.equal(verdictTone("CAUTION"), "warn");
  assert.equal(verdictTone("REJECT"), "bad");
  assert.equal(verdictTone(undefined), "none");
});
