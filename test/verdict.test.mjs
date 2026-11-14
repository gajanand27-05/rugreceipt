// code/test/verdict.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../lib/verdict.mjs";

const good = () => ({
  wash: { state: "unchecked", value: { verdict: "organic", pct: null } },
  liquidity: { state: "confirmed", value: 28_000_000 },
  holders: { state: "unchecked", value: 601_904 },
  price: { state: "confirmed", value: 0.0000045 },
  sanctions: { state: "confirmed", value: false },
});

test("clean token is LIST", () => {
  assert.deepEqual(decide(good()), { verdict: "LIST", reasons: [], note: null });
});
test("LINK case: likely wash trading is info only, still LIST", () => {
  const r = good(); r.wash.value = { verdict: "likely_wash_trading", pct: null };
  assert.equal(decide(r).verdict, "LIST");
});
test("wash with no answer does not change the verdict", () => {
  const r = good(); r.wash = { state: "no_answer", value: null };
  assert.equal(decide(r).verdict, "LIST");
});
test("plain wash_trading verdict is CAUTION", () => {
  const r = good(); r.wash.value = { verdict: "wash_trading", pct: null };
  assert.equal(decide(r).verdict, "CAUTION");
  assert.match(decide(r).reasons[0], /wash/);
});
test("skipped sanctions still LIST, with a note", () => {
  const r = good(); r.sanctions = { state: "skipped", value: null };
  assert.equal(decide(r).verdict, "LIST");
  assert.equal(decide(r).note, "sanctions not checked");
});
test("sanctions match is REJECT", () => {
  const r = good(); r.sanctions.value = true;
  assert.equal(decide(r).verdict, "REJECT");
  assert.match(decide(r).reasons[0], /sanctions/i);
});
test("Macca case: low liquidity and few holders is CAUTION with both reasons", () => {
  const r = good(); r.liquidity.value = 20_651; r.holders.value = 390; r.sanctions = { state: "skipped", value: null };
  const d = decide(r);
  assert.equal(d.verdict, "CAUTION");
  assert.equal(d.reasons.length, 2);
});
test("a verdict check with no answer is CAUTION", () => {
  const r = good(); r.holders = { state: "no_answer", value: null };
  assert.equal(decide(r).verdict, "CAUTION");
  assert.match(decide(r).reasons.join(" "), /holders/);
});
test("REJECT beats CAUTION", () => {
  const r = good(); r.sanctions.value = true; r.liquidity.value = 10;
  assert.equal(decide(r).verdict, "REJECT");
});
