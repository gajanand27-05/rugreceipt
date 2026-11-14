// code/lib/honeypot.mjs: free honeypot / tax simulation from honeypot.is (no API key needed as of 14 Nov 2026).
// Not Telegraph intelligence: no Telegraph intent detects honeypots (tested 14 Nov, intent-quality-survey.md).
import { CONFIG } from "./config.mjs";

const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function checkHoneypot(token, fetchFn = fetch) {
  const res = await fetchFn(`https://api.honeypot.is/v2/IsHoneypot?address=${token}&chainID=1`);
  if (!res.ok) throw new Error(`honeypot.is HTTP ${res.status}`);
  const j = await res.json();
  const sim = j.simulationResult ?? {};
  const out = { reason: j.honeypotResult?.honeypotReason ?? null, buyTax: n(sim.buyTax), sellTax: n(sim.sellTax), holders: n(j.token?.totalHolders) };
  if (j.honeypotResult?.isHoneypot === true) return { status: "honeypot", ...out };
  if (!j.simulationSuccess || j.honeypotResult?.isHoneypot !== false) return { status: "unknown", ...out };
  return { status: out.sellTax > CONFIG.maxSellTaxPct ? "high_tax" : "ok", ...out };
}
