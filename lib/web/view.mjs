// code/lib/web/view.mjs: display helpers for the report table (pure, shared by live and saved pages).
import { CHECKS } from "../checks.mjs";

// Rows that decide the verdict first, then the free safety row, then info-only rows.
export const ROW_ORDER = ["liquidity", "holders", "price", "sanctions", "honeypot", "wash", "supply"];
const LABELS = {
  ...Object.fromEntries(CHECKS.map((c) => [c.id, c.label])),
  honeypot: "Honeypot / sell tax",
  supply: "Total supply (on-chain)",
};

export function rowsForDisplay(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ROW_ORDER.map((id) => byId.get(id) ?? { id, label: LABELS[id], pending: true });
}

export const receiptUrl = (row) => (row.receipt?.tx_hash ? `https://sepolia.etherscan.io/tx/${row.receipt.tx_hash}` : null);

export const verdictTone = (v) => ({ LIST: "ok", CAUTION: "warn", REJECT: "bad" })[v] ?? "none";
