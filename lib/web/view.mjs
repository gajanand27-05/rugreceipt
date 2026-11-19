// code/lib/web/view.mjs: display helpers for the report table (pure, shared by live and saved pages).
import { CHECKS } from "../checks.mjs";
import { CONFIG } from "../config.mjs";

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

// x402 receipts settle on Sepolia (tx link). Escrow receipts have no tx: they are proven in the epoch's ledger block
// (404 until that block is recorded, up to ~1 h on testnet).
export function receiptUrl(row) {
  const r = row.receipt;
  if (r?.tx_hash) return `https://sepolia.etherscan.io/tx/${r.tx_hash}`;
  if (r?.receipt_hash && r.epoch_id != null) return `${CONFIG.node}/v1/blocks/${r.epoch_id}/deliveries/${r.receipt_hash}`;
  return null;
}

export const verdictTone = (v) => ({ LIST: "ok", CAUTION: "warn", REJECT: "bad" })[v] ?? "none";
