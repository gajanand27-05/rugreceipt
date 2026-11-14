// code/lib/engine.mjs: token in → free data (one parallel step) → paid checks in parallel → cross-check → verdict → report.
// Report contract is frozen for Part 2 (CODING-PLAN.md, Task 7). Every row has a `source`; free rows cost 0 and have no receipt.
import { CONFIG } from "./config.mjs";
import { CHECKS, buildCtx, checksFor, sanctionsHit } from "./checks.mjs";
import { buy } from "./telegraph.mjs";
import { compare, effectiveValue } from "./crosscheck.mjs";
import { decide } from "./verdict.mjs";
import { findMainPool } from "./pool.mjs";
import { readTotalSupply } from "./onchain.mjs";
import { loadSdn } from "./sanctions.mjs";
import { checkHoneypot as honeypotIs } from "./honeypot.mjs";

const within = (fn, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  Promise.resolve().then(fn).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

const emptyRow = { providerValue: null, reference: null, miner: null, receipt: null, signal: null, ms: null, error: null, note: null };

export async function runTokenCheck({ token, name = null }, deps, onRow = () => {}) {
  const {
    payFetch, findPool = findMainPool, readSupply = readTotalSupply, loadSanctions = loadSdn,
    checkHoneypot = honeypotIs, now = () => new Date(), freeTimeoutMs = CONFIG.freeTimeoutMs,
    ofacTimeoutMs = CONFIG.checkTimeoutMs,
  } = deps;
  const emit = (row) => { try { onRow(row); } catch { /* a UI callback must never lose a paid report */ } return row; };

  // 1. Pool first: without it nothing can be checked, so fail clearly before paying anything.
  const pool = await within(() => findPool(token), freeTimeoutMs).catch((e) => {
    throw new Error(/timed out/.test(e.message) ? "DexScreener pool lookup timed out" : e.message);
  });
  if (!pool) throw new Error("No Ethereum pool where this token is the main (base) token");

  // 2. All other free data in one parallel step. A failed free source is null ("not checked"), never a throw.
  // The OFAC list (~11 s to download on 14 Nov) is only needed to judge the paid sanctions answer,
  // so it starts now and runs alongside the paid checks with their longer limit.
  const base = buildCtx({ token, pool, name });
  const free = (fn, ms = freeTimeoutMs) => within(fn, ms).catch(() => null);
  const sdnLoad = base.name ? free(() => loadSanctions(), ofacTimeoutMs) : Promise.resolve(null);
  const [supply, honeypot] = await Promise.all([free(() => readSupply(token)), free(() => checkHoneypot(token))]);
  const ctx = buildCtx({ token, pool, name, honeypot, supply });

  const freeRows = [
    emit({ ...emptyRow, id: "supply", label: "Total supply (on-chain)", source: "onchain",
      state: supply == null ? "no_answer" : "info", value: supply, costUusdc: 0,
      note: supply == null ? "on-chain read failed: not checked" : null }),
    emit({ ...emptyRow, id: "honeypot", label: "Honeypot / sell tax", source: "honeypot.is",
      state: honeypot && honeypot.status !== "unknown" ? "unchecked" : "no_answer", value: honeypot, costUusdc: 0,
      note: !honeypot ? "honeypot.is unavailable: not checked"
        : honeypot.status === "unknown" ? "honeypot.is could not simulate this token: not checked" : null }),
  ];

  // 3. Paid checks in parallel. Sanctions without a name is skipped and not paid.
  const paidRows = await Promise.all(CHECKS.map(async (c) => {
    const head = { id: c.id, label: c.label, source: "telegraph", intent: c.intent };
    if (!checksFor(ctx).includes(c)) return emit({ ...emptyRow, ...head, state: "skipped", value: null, costUusdc: 0 });
    const res = await buy(payFetch, c.body(ctx, CONFIG.REQUEST_MODE[c.id]));
    const providerValue = res.ok ? c.read(res.result) : null;
    const cctx = c.id === "sanctions" ? { ...ctx, sdn: await sdnLoad } : ctx;
    const reference = c.reference(cctx);
    const state = c.infoOnly ? (providerValue == null ? "no_answer" : "info") : compare(providerValue, reference, c.kind);
    return emit({
      ...head, state, value: c.infoOnly ? providerValue : effectiveValue(state, providerValue, reference),
      providerValue, reference, miner: res.miner, receipt: res.receipt, costUusdc: res.costUusdc,
      signal: res.signal, ms: res.ms, error: res.error, note: res.note,
      ...(c.id === "sanctions" ? { sanctionsHit: sanctionsHit(cctx) } : {}),
    });
  }));

  const rows = [...paidRows, ...freeRows];
  const forVerdict = Object.fromEntries(rows.map((r) => [r.id,
    r.id === "sanctions" ? { ...r, possibleHit: r.sanctionsHit?.level === "possible" ? r.sanctionsHit.name : null } : r]));
  const { verdict, reasons, note } = decide(forVerdict);
  const asked = paidRows.filter((r) => r.state !== "skipped");
  return {
    app: "RugReceipt", testnet: true, network: "testnet (Ethereum Sepolia, test USDC)",
    token, name: ctx.name, checkedAt: now().toISOString(), pool,
    verdict, reasons, note, rows,
    paidCount: asked.filter((r) => r.receipt).length,
    totalCostUusdc: asked.reduce((s, r) => s + (r.costUusdc ?? 0), 0),
    costUnknownCount: asked.filter((r) => r.costUusdc == null).length,
    wrongCount: rows.filter((r) => r.state === "looks_wrong").length,
  };
}
