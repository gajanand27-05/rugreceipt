// code/lib/verdict.mjs: LIST / CAUTION / REJECT from the effective values.
// Wash trading is info only (DECISIONS.md, 14 Nov): only a plain "wash_trading" answer adds a CAUTION.
import { CONFIG } from "./config.mjs";

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const VERDICT_CHECKS = ["liquidity", "holders", "price", "sanctions"];

export function decide(rows) {
  const reject = [], caution = [];
  const { wash, liquidity, holders, sanctions } = rows;

  if (sanctions?.value === true) reject.push("team/company name matches a sanctions list");

  for (const id of VERDICT_CHECKS) if (rows[id]?.state === "no_answer") caution.push(`${id} check got no answer`);
  if (wash?.value?.verdict === "wash_trading") caution.push("provider reported wash trading");
  if (typeof liquidity?.value === "number" && liquidity.value < CONFIG.minLiquidityUsd) caution.push(`liquidity ${usd(liquidity.value)} is under ${usd(CONFIG.minLiquidityUsd)}`);
  if (typeof holders?.value === "number" && holders.value < CONFIG.minHolders) caution.push(`only ${holders.value} holders (under ${CONFIG.minHolders})`);

  const note = sanctions?.state === "skipped" ? "sanctions not checked" : null;
  if (reject.length) return { verdict: "REJECT", reasons: reject, note };
  if (caution.length) return { verdict: "CAUTION", reasons: caution, note };
  return { verdict: "LIST", reasons: [], note };
}
