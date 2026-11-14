// code/lib/checks.mjs: what each paid check sends, what it reads back, and its free reference.
// No paid supply check (broken intent, 14 Nov): the engine shows on-chain supply as a free info row.
import { matchSdn } from "./sanctions.mjs";

// Numbers, or plain decimal strings like "9544.88" (decided 14 Nov). Anything else is no answer.
const num = (v) => {
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) v = Number(v);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const obj = (r) => (r && typeof r === "object" ? r : {});
const WASH_VERDICTS = ["wash_trading", "likely_wash_trading", "inconclusive", "organic"];
const make = (intent, params, query) => (ctx, mode) => {
  if (mode === "params") return { intent, params: params(ctx) };
  if (mode === "query") return { intent, query: query(ctx) };
  throw new Error(`unknown request mode "${mode}" for ${intent}`);
};

// Trim the team name once; blank means no name (sanctions skipped, not paid).
// Free data (sdn, honeypot, supply) is gathered by the engine before any paid check.
export const buildCtx = ({ token, pool, name = null, sdn = null, honeypot = null, supply = null }) =>
  ({ token, pool, name: name?.trim() || null, sdn, honeypot, supply });

export const checksFor = (ctx) => CHECKS.filter((c) => c.id !== "sanctions" || ctx.name);

// OFAC result: { level: "definite" | "possible", name } or null (no match, no name, or no list).
export function sanctionsHit(ctx) {
  if (!ctx.sdn || !ctx.name) return null;
  const m = matchSdn(ctx.name, ctx.sdn);
  if (m.matched) return { level: "definite", name: m.hit };
  return m.possible ? { level: "possible", name: m.possible } : null;
}

export const CHECKS = [
  {
    id: "wash", label: "Wash trading", intent: "WASH_TRADING_DETECTION_GENERAL", kind: "wash", infoOnly: true,
    body: make("WASH_TRADING_DETECTION_GENERAL", (c) => ({ subject: c.pool.pool }),
      (c) => `Check wash trading on the ${c.pool.dex} ${c.pool.symbol} pool ${c.pool.pool} (token ${c.token}) on Ethereum`),
    read: (r) => (WASH_VERDICTS.includes(obj(r).verdict) ? { verdict: r.verdict, pct: num(r.wash_volume_pct) } : null),
    reference: () => null,
  },
  {
    id: "liquidity", label: "Pool liquidity", intent: "LIQUIDITY_DEPTH_VERIFY_GENERAL", kind: "number",
    body: make("LIQUIDITY_DEPTH_VERIFY_GENERAL", (c) => ({ pool: c.pool.pool, chain: "ethereum" }),
      (c) => `Liquidity depth of the ${c.pool.dex} ${c.pool.symbol} pool ${c.pool.pool} (token ${c.token}) on Ethereum`),
    read: (r) => num(obj(r).liquidity_usd),
    reference: (c) => c.pool.liquidityUsd ?? null,
  },
  {
    id: "holders", label: "Holders", intent: "TOKEN_HOLDER_COUNT_GENERAL", kind: "number",
    body: make("TOKEN_HOLDER_COUNT_GENERAL", (c) => ({ token: c.token, chain: "ethereum" }),
      (c) => `How many holders does token ${c.token} on Ethereum have?`),
    read: (r) => num(obj(r).holders_count),
    reference: (c) => c.honeypot?.holders ?? null,   // honeypot.is token.totalHolders (free)
  },
  {
    id: "price", label: "Price (USD)", intent: "CRYPTO_PRICE_USD", kind: "number",
    body: make("CRYPTO_PRICE_USD", (c) => ({ symbol: c.pool.symbol }),
      (c) => `Price in USD of token ${c.pool.symbol} (contract ${c.token} on Ethereum)`),
    read: (r) => num(obj(r).price_usd),
    reference: (c) => c.pool.priceUsd ?? null,
  },
  {
    id: "sanctions", label: "Sanctions (team)", intent: "SANCTIONS_SCREENING_MATCH_GENERAL", kind: "boolean",
    body: make("SANCTIONS_SCREENING_MATCH_GENERAL", (c) => ({ name: c.name }), (c) => c.name),
    read: (r) => { const v = obj(r).matched ?? obj(r).match; return typeof v === "boolean" ? v : null; },
    // true = definite OFAC match, false = not listed, null = possible match or no list ("not checked").
    reference: (c) => {
      if (!c.sdn || !c.name) return null;
      const hit = sanctionsHit(c);
      return hit ? (hit.level === "definite" ? true : null) : false;
    },
  },
];
