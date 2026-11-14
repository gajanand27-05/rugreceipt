// code/test/engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { runTokenCheck } from "../lib/engine.mjs";

const pool = { chain: "ethereum", pool: "0xPOOL", dex: "uniswap", symbol: "MACCA", name: "Macca", priceUsd: 0.000017, liquidityUsd: 20651.67 };
// Fake Telegraph mirroring the real 14 Nov Macca results; price wrong like on 13 Nov.
const answers = {
  WASH_TRADING_DETECTION_GENERAL: { verdict: "likely_wash_trading", wash_volume_pct: null },
  LIQUIDITY_DEPTH_VERIFY_GENERAL: { liquidity_usd: 20651.67 },
  TOKEN_HOLDER_COUNT_GENERAL: { holders_count: 390 },
  CRYPTO_PRICE_USD: { price_usd: 0.0021 },
  SANCTIONS_SCREENING_MATCH_GENERAL: { matched: false },
};
const receiptHeader = Buffer.from(JSON.stringify({ amount_uusdc: "10000", tx_hash: "0xt" })).toString("base64");
const reply = (result, status = 200, withReceipt = true) =>
  ({ status, headers: { get: (h) => (h === "x-telegraph-receipt" && withReceipt ? receiptHeader : null) }, json: async () => ({ miner_name: "Fake", result, signal_hash: "0xs" }) });
const intentOf = (init) => JSON.parse(init.body).intent;
const fakePay = async (_u, init) => reply(answers[intentOf(init)]);
const deps = {
  payFetch: fakePay, findPool: async () => pool, readSupply: async () => 1_000_000_000,
  loadSanctions: async () => ["OPEN JOINT STOCK COMPANY ROSNEFT OIL COMPANY", "DIANA"],
  checkHoneypot: async () => ({ status: "ok", reason: null, buyTax: 0, sellTax: 0, holders: 395 }),
  now: () => new Date("2026-11-14T15:40:00Z"), freeTimeoutMs: 50,
};
const byId = (r) => Object.fromEntries(r.rows.map((x) => [x.id, x]));

test("Macca: CAUTION, wrong price caught, wash info only, free rows labelled, 4 paid", async () => {
  const seen = [];
  const r = await runTokenCheck({ token: "0xTOKEN" }, deps, (row) => seen.push(row.id));
  const s = byId(r);
  assert.equal(r.verdict, "CAUTION");
  assert.equal(r.paidCount, 4);
  assert.equal(r.totalCostUusdc, 40000);
  assert.equal(r.costUnknownCount, 0);
  assert.equal(s.liquidity.state, "confirmed");
  assert.equal(s.holders.state, "confirmed");          // 390 vs honeypot.is 395
  assert.equal(s.price.state, "looks_wrong");
  assert.equal(s.price.value, 0.000017);
  assert.equal(s.wash.state, "info");
  assert.equal(s.sanctions.state, "skipped");
  assert.equal(s.sanctions.costUusdc, 0);
  assert.equal(s.supply.source, "onchain");
  assert.equal(s.supply.state, "info");
  assert.equal(s.supply.value, 1_000_000_000);
  assert.equal(s.honeypot.source, "honeypot.is");
  assert.equal(s.liquidity.source, "telegraph");
  assert.equal(r.wrongCount, 1);
  assert.equal(seen.length, r.rows.length);
  assert.equal(r.testnet, true);
  assert.equal(r.checkedAt, "2026-11-14T15:40:00.000Z");
});
test("a failing provider becomes no_answer with unknown cost, not a crash", async () => {
  const flaky = async (u, init) => (intentOf(init) === "TOKEN_HOLDER_COUNT_GENERAL" ? reply({}, 500, false) : fakePay(u, init));
  const r = await runTokenCheck({ token: "0xTOKEN" }, { ...deps, payFetch: flaky });
  const h = byId(r).holders;
  assert.equal(h.state, "no_answer");
  assert.equal(h.costUusdc, null);
  assert.equal(r.costUnknownCount, 1);
  assert.equal(r.paidCount, 3);
  assert.equal(r.verdict, "CAUTION");
});
test("no pool means a clear error before any payment", async () => {
  let paid = 0;
  const counting = async (...a) => { paid++; return fakePay(...a); };
  await assert.rejects(runTokenCheck({ token: "0xNONE" }, { ...deps, payFetch: counting, findPool: async () => null }), /main \(base\) token/);
  assert.equal(paid, 0);
});
test("a hanging pool lookup times out with a clear error before any payment", async () => {
  let paid = 0;
  const counting = async (...a) => { paid++; return fakePay(...a); };
  await assert.rejects(runTokenCheck({ token: "0xT" }, { ...deps, payFetch: counting, findPool: () => new Promise(() => {}) }), /pool lookup timed out/);
  assert.equal(paid, 0);
});
test("hanging or failing free sources become 'not checked', never a crash", async () => {
  const hang = () => new Promise(() => {});
  const r = await runTokenCheck({ token: "0xT", name: "Uniswap Labs" },
    { ...deps, readSupply: hang, checkHoneypot: async () => { throw new Error("honeypot.is HTTP 503"); }, loadSanctions: hang });
  const s = byId(r);
  assert.equal(s.supply.state, "no_answer");
  assert.equal(s.honeypot.state, "no_answer");
  assert.match(s.honeypot.note, /not checked/);
  assert.equal(s.sanctions.state, "unchecked");      // OFAC list missing → not "confirmed clean"
  assert.equal(s.holders.state, "unchecked");        // no honeypot.is holder count
});
test("a name on the OFAC list forces REJECT even if the provider says clean", async () => {
  const r = await runTokenCheck({ token: "0xT", name: "Rosneft Oil Company" }, deps);
  const s = byId(r).sanctions;
  assert.equal(s.state, "looks_wrong");
  assert.equal(s.providerValue, false);
  assert.deepEqual(s.sanctionsHit, { level: "definite", name: "OPEN JOINT STOCK COMPANY ROSNEFT OIL COMPANY" });
  assert.equal(r.verdict, "REJECT");
});
test("whole path: a one-word possible OFAC hit ends as CAUTION naming the listed entry", async () => {
  const liquid = { ...pool, liquidityUsd: 9e6 };
  const big = async (u, init) => (intentOf(init) === "LIQUIDITY_DEPTH_VERIFY_GENERAL" ? reply({ liquidity_usd: 9e6 })
    : intentOf(init) === "TOKEN_HOLDER_COUNT_GENERAL" ? reply({ holders_count: 9000 }) : fakePay(u, init));
  const r = await runTokenCheck({ token: "0xT", name: "Diana" },
    { ...deps, payFetch: big, findPool: async () => liquid, checkHoneypot: async () => ({ status: "ok", holders: 9000 }) });
  assert.equal(r.verdict, "CAUTION");
  assert.deepEqual(r.reasons, ["possible sanctions match: DIANA"]);
});
test("honeypot.is honeypot is REJECT through the engine", async () => {
  const r = await runTokenCheck({ token: "0xT" },
    { ...deps, checkHoneypot: async () => ({ status: "honeypot", reason: "TRANSFER_FROM_FAILED", buyTax: 0, sellTax: 100, holders: 38 }) });
  assert.equal(r.verdict, "REJECT");
  assert.match(r.reasons[0], /^honeypot\.is/);
});
test("a crashing onRow callback cannot lose a paid report", async () => {
  const r = await runTokenCheck({ token: "0xT" }, deps, () => { throw new Error("UI crashed"); });
  assert.equal(r.paidCount, 4);
});
