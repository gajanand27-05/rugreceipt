// code/lib/cli.mjs: argument checks and text formatting for check.mjs (no network, tested offline).
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const USAGE = 'Usage: npm run check -- <token address> [--name "Team or company name"]';

export function parseArgs(argv) {
  const [token, flag, name, ...rest] = argv;
  if (!ADDRESS.test(token ?? "")) return { error: `Not a token address: ${token ?? "(none)"}` };
  if (flag === undefined) return { token, name: null };
  if (flag !== "--name" || rest.length) return { error: `Unknown argument: ${[flag, name, ...rest].filter(Boolean).join(" ")}` };
  if (!name?.trim()) return { error: "--name needs a value" };
  return { token, name: name.trim() };
}

export function keyProblem(key) {
  if (!key) return "EVM_PRIVATE_KEY is missing. Run `npm run wallet` once to create code/.env.";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return "EVM_PRIVATE_KEY in code/.env is not a valid private key (0x + 64 hex characters).";
  return null;
}

// Token symbols are chosen by the token's creator: keep only safe characters for a filename.
export const safeSymbol = (s) =>
  String(s ?? "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "").slice(0, 20) || "TOKEN";

const int = (n) => Math.round(n).toLocaleString("en-US");
const price = (n) => "$" + (n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
  : n.toLocaleString("en-US", { maximumSignificantDigits: 4, maximumFractionDigits: 20 }));
const FORMAT = { liquidity: (n) => "$" + int(n), holders: int, supply: int, price };

function honeypotText(h) {
  const tax = h.sellTax != null ? `, sell tax ${h.sellTax}%` : "";
  if (h.status === "ok") return `ok${tax}`;
  if (h.status === "high_tax") return `HIGH TAX${tax}`;
  if (h.status === "honeypot") return `HONEYPOT (${h.reason ?? "no reason given"})${tax}`;
  return "unknown";
}

export function showValue(row) {
  const v = row.value;
  if (v === null || v === undefined) return "-";
  if (row.id === "wash") return `${v.verdict}${v.pct != null ? ` (${v.pct}%)` : ""}`;
  if (row.id === "honeypot") return honeypotText(v);
  if (row.id === "sanctions") {
    const hit = row.sanctionsHit;
    const ofac = hit ? ` (OFAC${hit.level === "possible" ? " possible match" : ""}: ${hit.name})` : "";
    return (v ? "listed" : "not listed") + ofac;
  }
  const f = FORMAT[row.id] ?? String;
  const paid = row.state === "looks_wrong" && typeof row.providerValue === "number" ? ` (paid said ${f(row.providerValue)})` : "";
  return f(v) + paid;
}

const SOURCE = { onchain: "on-chain", "honeypot.is": "honeypot.is" };
const PAID_MARK = {
  confirmed: "✓ confirmed", unchecked: "not cross-checked", info: "info only",
  looks_wrong: "⚠ looks wrong, reference used", skipped: "- skipped (no --name)",
};

export function markFor(row) {
  if (row.source === "telegraph") {
    if (row.state !== "no_answer") return PAID_MARK[row.state] ?? row.state;
    const why = row.error ?? row.note;
    if (why) return `✗ no answer (${why})`;
    // 200 with an unreadable or "insufficient data" answer: still billed (Telegraph docs, 14 Nov).
    return row.costUusdc != null ? "✗ no usable answer (paid)" : "✗ no answer";
  }
  const parts = ["free", SOURCE[row.source] ?? row.source];
  if (row.state === "info") parts.push("info only");
  if (row.state === "no_answer") parts.push(`✗ ${row.note ?? "not checked"}`);
  return parts.join(" · ");
}

export const usd = (uusdc) => `$${(uusdc / 1e6).toFixed(2)}`;

export function costText(row) {
  if (row.source !== "telegraph") return "free";
  if (row.state === "skipped") return "-";
  return row.costUusdc == null ? "cost unknown" : usd(row.costUusdc);
}

export function totalLine(r) {
  const unknown = r.costUnknownCount
    ? ` · ${r.costUnknownCount} check${r.costUnknownCount > 1 ? "s" : ""} with cost unknown (no receipt; a failed paid request is credited to escrow)`
    : "";
  return `Total: ${usd(r.totalCostUusdc)} test USDC · ${r.paidCount} receipt${r.paidCount === 1 ? "" : "s"}${unknown}`;
}
