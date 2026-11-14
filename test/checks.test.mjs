// code/test/checks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, buildCtx, checksFor, sanctionsHit } from "../lib/checks.mjs";
import { CONFIG } from "../lib/config.mjs";

const byId = Object.fromEntries(CHECKS.map((c) => [c.id, c]));
const pool = { chain: "ethereum", pool: "0xPOOL", dex: "uniswap", symbol: "MACCA", priceUsd: 0.000017, liquidityUsd: 9545 };
const SDN = ["OPEN JOINT STOCK COMPANY ROSNEFT OIL COMPANY", "DIANA"];
const ctx = buildCtx({ token: "0xTOKEN", pool, name: "  Rosneft Oil Company ", sdn: SDN });

test("exactly the planned checks: no paid supply", () => {
  assert.deepEqual(CHECKS.map((c) => c.id), ["wash", "liquidity", "holders", "price", "sanctions"]);
});
test("every check has a request mode in CONFIG", () => {
  for (const c of CHECKS) assert.ok(["params", "query"].includes(CONFIG.REQUEST_MODE[c.id]), c.id);
});
test("an unknown or missing mode throws instead of silently sending plain English", () => {
  assert.throws(() => byId.liquidity.body(ctx, undefined), /request mode/);
  assert.throws(() => byId.liquidity.body(ctx, "qery"), /request mode/);
});
test("only wash is info only", () => {
  assert.deepEqual(CHECKS.filter((c) => c.infoOnly).map((c) => c.id), ["wash"]);
});
test("params bodies use the intent's published field names", () => {
  assert.deepEqual(byId.liquidity.body(ctx, "params"), { intent: "LIQUIDITY_DEPTH_VERIFY_GENERAL", params: { pool: "0xPOOL", chain: "ethereum" } });
  assert.deepEqual(byId.holders.body(ctx, "params"), { intent: "TOKEN_HOLDER_COUNT_GENERAL", params: { token: "0xTOKEN", chain: "ethereum" } });
  assert.deepEqual(byId.price.body(ctx, "params"), { intent: "CRYPTO_PRICE_USD", params: { symbol: "MACCA" } });
});
test("query bodies are plain English; sanctions sends the trimmed name", () => {
  assert.equal(byId.sanctions.body(ctx, "query").query, "Rosneft Oil Company");
  assert.match(byId.wash.body(ctx, "query").query, /0xPOOL/);
});
test("the name is trimmed once; a blank name means no name and no paid sanctions check", () => {
  assert.equal(ctx.name, "Rosneft Oil Company");
  const blank = buildCtx({ token: "0xT", pool, name: "   ", sdn: SDN });
  assert.equal(blank.name, null);
  assert.deepEqual(checksFor(blank).map((c) => c.id), ["wash", "liquidity", "holders", "price"]);
  assert.deepEqual(checksFor(ctx).map((c) => c.id), ["wash", "liquidity", "holders", "price", "sanctions"]);
});
test("readers pull the right field", () => {
  assert.deepEqual(byId.wash.read({ verdict: "organic", wash_volume_pct: 0 }), { verdict: "organic", pct: 0 });
  assert.equal(byId.liquidity.read({ liquidity_usd: 9544.88 }), 9544.88);
  assert.equal(byId.holders.read({ holders_count: 101 }), 101);
  assert.equal(byId.price.read({ price_usd: 0.0021 }), 0.0021);
  assert.equal(byId.sanctions.read({ match: true }), true);
  assert.equal(byId.sanctions.read({ matched: false }), false);
});
test("junk answers become no answer (null)", () => {
  assert.equal(byId.liquidity.read("<!DOCTYPE html>"), null);
  assert.equal(byId.price.read(null), null);
  assert.equal(byId.holders.read({ holders_count: "0x10" }), null);
  assert.equal(byId.holders.read({ holders_count: "" }), null);
  assert.equal(byId.wash.read({ verdict: "probably fine" }), null);
  assert.equal(byId.wash.read(null), null);
  assert.equal(byId.sanctions.read({ matched: "yes" }), null);
});
test("decided: a plain decimal number sent as a string is accepted", () => {
  assert.equal(byId.liquidity.read({ liquidity_usd: "9544.88" }), 9544.88);
  assert.equal(byId.holders.read({ holders_count: "101" }), 101);
});
test("references come from the free sources; holders and wash have none", () => {
  assert.equal(byId.liquidity.reference(ctx), 9545);
  assert.equal(byId.price.reference(ctx), 0.000017);
  assert.equal(byId.holders.reference(ctx), null);
  assert.equal(byId.wash.reference(ctx), null);
});
test("sanctions reference: definite match true, no match false", () => {
  assert.equal(byId.sanctions.reference(ctx), true);
  assert.deepEqual(sanctionsHit(ctx), { level: "definite", name: "OPEN JOINT STOCK COMPANY ROSNEFT OIL COMPANY" });
  const clean = buildCtx({ token: "0xT", pool, name: "Uniswap Labs", sdn: SDN });
  assert.equal(byId.sanctions.reference(clean), false);
  assert.equal(sanctionsHit(clean), null);
});
test("sanctions reference: a possible match is not checked (null) and carries the listed name", () => {
  const diana = buildCtx({ token: "0xT", pool, name: "Diana", sdn: SDN });
  assert.equal(byId.sanctions.reference(diana), null);
  assert.deepEqual(sanctionsHit(diana), { level: "possible", name: "DIANA" });
});
test("sanctions reference: no OFAC list means not checked, never clean", () => {
  const noList = buildCtx({ token: "0xT", pool, name: "Uniswap Labs", sdn: null });
  assert.equal(byId.sanctions.reference(noList), null);
  assert.equal(sanctionsHit(noList), null);
});
