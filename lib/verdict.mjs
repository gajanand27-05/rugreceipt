// code/lib/verdict.mjs: LIST / CAUTION / REJECT from the effective values.
// Wash trading is info only (DECISIONS.md, 14 Nov): only a plain "wash_trading" answer adds a CAUTION.
import { CONFIG } from "./config.mjs";

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const VERDICT_CHECKS = ["liquidity", "holders", "price", "sanctions"];

export function decide(rows) {
  const reject = [], caution = [];
  const { wash, liquidity, holders, sanctions, honeypot } = rows;

  if (sanctions?.value === true) reject.push("team/company name matches a sanctions list");
  // Free honeypot.is row: only a definite result counts; unavailable/unknown never changes the verdict.
  const hp = honeypot?.value;
  if (hp?.status === "honeypot") reject.push(`honeypot.is: sell simulation failed (${hp.reason ?? "no reason given"}${hp.sellTax != null ? `, ${hp.sellTax}% sell tax` : ""})`);
  if (hp?.status === "high_tax") caution.push(`honeypot.is: sell tax ${hp.sellTax}% (over ${CONFIG.maxSellTaxPct}%)`);
  // Never let "absent from OFAC" silently clear a hit: the provider may screen EU/UN lists.
  if (sanctions?.value !== true && sanctions?.possibleHit) caution.push(`possible sanctions match: ${sanctions.possibleHit}`);
  if (sanctions?.value === false && sanctions?.providerValue === true) caution.push("provider reported a sanctions match that is not found on the OFAC SDN list");

  for (const id of VERDICT_CHECKS) if (rows[id]?.state === "no_answer") caution.push(`${id} check got no answer`);
  if (wash?.value?.verdict === "wash_trading") caution.push("provider reported wash trading");
  if (typeof liquidity?.value === "number" && liquidity.value < CONFIG.minLiquidityUsd) caution.push(`liquidity ${usd(liquidity.value)} is under ${usd(CONFIG.minLiquidityUsd)}`);
  if (typeof holders?.value === "number" && holders.value < CONFIG.minHolders) caution.push(`only ${holders.value} holders (under ${CONFIG.minHolders})`);

  const note = sanctions?.state === "skipped" ? "sanctions not checked" : null;
  if (reject.length) return { verdict: "REJECT", reasons: reject, note };
  if (caution.length) return { verdict: "CAUTION", reasons: caution, note };
  return { verdict: "LIST", reasons: [], note };
}
