// code/test/cli.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, keyProblem, safeSymbol, showValue, markFor, costText, totalLine } from "../lib/cli.mjs";

const T = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";

test("parseArgs: token, optional --name, everything else is a usage error", () => {
  assert.deepEqual(parseArgs([T]), { token: T, name: null });
  assert.deepEqual(parseArgs([T, "--name", "Rosneft Oil Company"]), { token: T, name: "Rosneft Oil Company" });
  for (const bad of [[], ["0x1234"], [T, "--name"], [T, "--name", "  "], [T, "--nmae", "x"], [T, "extra"]])
    assert.ok(parseArgs(bad).error, JSON.stringify(bad));
});

test("keyProblem: missing or malformed key is caught before any network call", () => {
  assert.match(keyProblem(undefined), /EVM_PRIVATE_KEY is missing/);
  assert.match(keyProblem("0xabc"), /not a valid/);
  assert.equal(keyProblem("0x" + "a".repeat(64)), null);
});

test("safeSymbol: no path tricks, no Windows-illegal characters, never empty", () => {
  assert.equal(safeSymbol("PEPE"), "PEPE");
  assert.equal(safeSymbol("../../etc"), "etc");
  assert.equal(safeSymbol('a<b>c:"d/e\\f|g?h*'), "a_b_c_d_e_f_g_h");
  assert.equal(safeSymbol("🚀🚀"), "TOKEN");
  assert.equal(safeSymbol(""), "TOKEN");
  assert.equal(safeSymbol(null), "TOKEN");
  assert.equal(safeSymbol("A".repeat(50)).length, 20);
});

test("showValue: readable per check, and a wrong paid answer is shown next to the reference used", () => {
  assert.equal(showValue({ id: "liquidity", state: "confirmed", value: 20651.67 }), "$20,652");
  assert.equal(showValue({ id: "holders", state: "unchecked", value: 601904 }), "601,904");
  assert.equal(showValue({ id: "price", state: "looks_wrong", value: 0.000017, providerValue: 0.0021 }), "$0.000017 (paid said $0.0021)");
  assert.equal(showValue({ id: "wash", state: "info", value: { verdict: "likely_wash_trading", pct: null } }), "likely_wash_trading");
  assert.equal(showValue({ id: "wash", state: "info", value: { verdict: "organic", pct: 3 } }), "organic (3%)");
  assert.equal(showValue({ id: "sanctions", state: "confirmed", value: true, sanctionsHit: { level: "definite", name: "ROSNEFT" } }), "listed (OFAC: ROSNEFT)");
  assert.equal(showValue({ id: "sanctions", state: "unchecked", value: false, sanctionsHit: { level: "possible", name: "DIANA" } }), "not listed (OFAC possible match: DIANA)");
  assert.equal(showValue({ id: "honeypot", state: "unchecked", value: { status: "ok", sellTax: 0 } }), "ok, sell tax 0%");
  assert.equal(showValue({ id: "honeypot", state: "unchecked", value: { status: "honeypot", reason: "TRANSFER_FROM_FAILED", sellTax: 100 } }), "HONEYPOT (TRANSFER_FROM_FAILED), sell tax 100%");
  assert.equal(showValue({ id: "supply", state: "info", value: 420690000000000 }), "420,690,000,000,000");
  assert.equal(showValue({ id: "holders", state: "no_answer", value: null }), "-");
  assert.equal(showValue({ id: "price", source: "telegraph", state: "no_answer", value: 0.000017, reference: 0.000017 }), "market $0.000017 (paid: no answer)");
  assert.equal(showValue({ id: "liquidity", source: "telegraph", state: "no_answer", value: null, reference: null }), "-");
});

test("markFor: honest labels; free rows name their source", () => {
  assert.equal(markFor({ source: "telegraph", state: "confirmed" }), "✓ confirmed");
  assert.equal(markFor({ source: "telegraph", state: "unchecked" }), "not cross-checked");
  assert.equal(markFor({ source: "telegraph", state: "info" }), "info only");
  assert.equal(markFor({ source: "telegraph", state: "looks_wrong" }), "⚠ looks wrong, reference used");
  assert.equal(markFor({ source: "telegraph", state: "no_answer", error: "timeout after 45000 ms" }), "✗ no answer (timeout after 45000 ms)");
  assert.equal(markFor({ source: "telegraph", state: "no_answer", error: null, costUusdc: 10000 }), "✗ no usable answer (paid)");
  assert.equal(markFor({ source: "telegraph", state: "skipped" }), "- skipped (no name given)");
  assert.equal(markFor({ source: "onchain", state: "info" }), "free · on-chain · info only");
  assert.equal(markFor({ source: "honeypot.is", state: "unchecked" }), "free · honeypot.is");
  assert.equal(markFor({ source: "honeypot.is", state: "no_answer", note: "honeypot.is unavailable: not checked" }), "free · honeypot.is · ✗ honeypot.is unavailable: not checked");
});

test("costText: free, skipped, receipt amount, or 'cost unknown' (never $0.00 for an unknown)", () => {
  assert.equal(costText({ source: "onchain", costUusdc: 0 }), "free");
  assert.equal(costText({ source: "telegraph", state: "skipped", costUusdc: 0 }), "-");
  assert.equal(costText({ source: "telegraph", state: "confirmed", costUusdc: 10000 }), "$0.01");
  assert.equal(costText({ source: "telegraph", state: "no_answer", costUusdc: null }), "cost unknown");
});

test("totalLine: from receipts only, and says so when a cost is unknown", () => {
  assert.equal(totalLine({ totalCostUusdc: 40000, paidCount: 4, costUnknownCount: 0 }), "Total: $0.04 test USDC · 4 receipts");
  assert.equal(totalLine({ totalCostUusdc: 30000, paidCount: 3, costUnknownCount: 1 }),
    "Total: $0.03 test USDC · 3 receipts · 1 check with cost unknown (no receipt; a failed paid request is credited to escrow)");
});
