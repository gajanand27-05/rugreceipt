// code/test/verdict.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../lib/verdict.mjs";

const good = () => ({
  wash: { state: "unchecked", value: { verdict: "organic", pct: null } },
  liquidity: { state: "confirmed", value: 28_000_000 },
  holders: { state: "confirmed", value: 601_904 },
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
test("unchecked holders (no free reference) is CAUTION even with a huge count", () => {
  const r = good(); r.holders = { state: "unchecked", value: 9_590_792 };
  const d = decide(r);
  assert.equal(d.verdict, "CAUTION");
  assert.match(d.reasons.join(" "), /not cross-checked/);
  assert.match(d.reasons.join(" "), /9,590,792/);
});
test("REJECT beats CAUTION", () => {
  const r = good(); r.sanctions.value = true; r.liquidity.value = 10;
  assert.equal(decide(r).verdict, "REJECT");
});
test("a possible (one-word) sanctions hit is CAUTION, naming the listed entry", () => {
  const r = good(); r.sanctions.possibleHit = "DIANA";
  assert.equal(decide(r).verdict, "CAUTION");
  assert.match(decide(r).reasons[0], /possible sanctions match: DIANA/);
});
test("provider says sanctioned but OFAC does not: CAUTION, never a silent LIST", () => {
  const r = good(); r.sanctions = { state: "looks_wrong", value: false, providerValue: true };
  assert.equal(decide(r).verdict, "CAUTION");
  assert.match(decide(r).reasons[0], /not found on the OFAC SDN list/);
});
test("honeypot.is honeypot is REJECT, and the reason names the source", () => {
  const r = good(); r.honeypot = { state: "unchecked", value: { status: "honeypot", reason: "TRANSFER_FROM_FAILED", sellTax: 100 } };
  assert.equal(decide(r).verdict, "REJECT");
  assert.match(decide(r).reasons[0], /^honeypot\.is: sell simulation failed \(TRANSFER_FROM_FAILED, 100% sell tax\)/);
});
test("honeypot.is high sell tax is CAUTION", () => {
  const r = good(); r.honeypot = { state: "unchecked", value: { status: "high_tax", reason: null, sellTax: 25 } };
  assert.equal(decide(r).verdict, "CAUTION");
  assert.match(decide(r).reasons[0], /honeypot\.is: sell tax 25% \(over 10%\)/);
});
test("honeypot.is unavailable or unknown never changes the verdict", () => {
  const a = good(); a.honeypot = { state: "no_answer", value: null };
  const b = good(); b.honeypot = { state: "unchecked", value: { status: "unknown" } };
  assert.equal(decide(a).verdict, "LIST");
  assert.equal(decide(b).verdict, "LIST");
});
