// code/test/sim-verdict.test.mjs: the miner's subject parsing and verdict mapping (task4-miner-plan.md, items 1, 6, 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSubject, simVerdict } from "../lib/sim-verdict.mjs";

const T = "0x5599811FF441f045D64cad51cE4d74462FaF7a1d";

test("a bare address is an Ethereum token candidate, lower-cased", () => {
  assert.deepEqual(parseSubject(T), { ok: true, address: T.toLowerCase() });
});
test("free text with exactly one address and no other chain is accepted", () => {
  assert.deepEqual(parseSubject(`Is ${T} on ethereum a honeypot?`), { ok: true, address: T.toLowerCase() });
});
test("two different addresses are refused", () => {
  assert.equal(parseSubject(`${T} or 0x6982508145454Ce325dDbE47a25d4ec3d2311933`).ok, false);
});
test("no address (an IP, a name) is refused", () => {
  assert.equal(parseSubject("192.168.1.1").ok, false);
  assert.equal(parseSubject("Acme Ltd").ok, false);
});
test("another chain named is refused", () => {
  for (const c of ["base", "BSC", "Arbitrum", "polygon", "solana", "bnb chain"])
    assert.equal(parseSubject(`${T} on ${c}`).ok, false, c);
});

const sim = (o) => ({ buyOk: true, sellOk: true, buyTax: 0, sellTax: 0, transferTax: 0, revertReason: null, ...o });

test("sell reverts with no recent real sells: FRAUD 0.95", () => {
  const v = simVerdict(sim({ sellOk: false, revertReason: "TRANSFER_FROM_FAILED" }), { realSells: 0, senders: 0 });
  assert.equal(v.verdict, "FRAUD");
  assert.equal(v.risk_score, 0.95);
  assert.ok(v.signals.some((s) => s.includes("TRANSFER_FROM_FAILED")));
});
test("sell tax of 50% or more with no recent real sells: LIKELY_FRAUD 0.85", () => {
  const v = simVerdict(sim({ sellTax: 0.6 }), { realSells: 0, senders: 0 });
  assert.deepEqual([v.verdict, v.risk_score], ["LIKELY_FRAUD", 0.85]);
});
test("sell reverts but 3+ real sells from 2+ senders: downgraded to SUSPICIOUS 0.6 (anti-bot)", () => {
  const v = simVerdict(sim({ sellOk: false }), { realSells: 5, senders: 4 });
  assert.deepEqual([v.verdict, v.risk_score], ["SUSPICIOUS", 0.6]);
  assert.ok(v.signals.some((s) => s.includes("5 real sells succeeded")));
});
test("real sells from a single sender do not downgrade", () => {
  assert.equal(simVerdict(sim({ sellOk: false }), { realSells: 9, senders: 1 }).verdict, "FRAUD");
});
test("real-sell check unavailable keeps the simulation verdict and says so", () => {
  const v = simVerdict(sim({ sellOk: false }), null);
  assert.equal(v.verdict, "FRAUD");
  assert.ok(v.signals.includes("real-sell check unavailable"));
});
test("a 10-50% tax, a blocked transfer or a failed buy is SUSPICIOUS 0.6", () => {
  assert.equal(simVerdict(sim({ sellTax: 0.2 })).verdict, "SUSPICIOUS");
  assert.equal(simVerdict(sim({ buyTax: 0.12 })).verdict, "SUSPICIOUS");
  assert.equal(simVerdict(sim({ transferTax: 1 })).verdict, "SUSPICIOUS");
  assert.equal(simVerdict(sim({ buyOk: false, sellOk: false })).verdict, "SUSPICIOUS");
});
test("a clean simulation is LOW 0.15, never LEGITIMATE, and says it is simulation only", () => {
  const v = simVerdict(sim({ sellTax: 0.01 }));
  assert.deepEqual([v.verdict, v.risk_score], ["LOW", 0.15]);
  assert.match(v.summary, /simulat/i);
  assert.match(v.summary, /not checked/i);
});
