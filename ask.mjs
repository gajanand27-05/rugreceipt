// Makes one paid Telegraph request (~$0.01 test USDC) and saves the answer + receipt to evidence/.
// Pays from Telegraph escrow by default; TELEGRAPH_PAY=x402 pays per call through the x402 facilitator.
// Usage: npm run ask -- '{"intent":"CRYPTO_PRICE_USD","params":{"symbol":"BTC"}}'
import { writeFileSync } from "node:fs";
import { CONFIG } from "./lib/config.mjs";
import { makePayingFetch, railFromEnv, readReceipt, askEvidence } from "./lib/telegraph.mjs";

const body = process.argv[2] ?? '{"intent":"CRYPTO_PRICE_USD","params":{"symbol":"BTC"}}';
const rail = railFromEnv();
const payFetch = makePayingFetch(process.env.EVM_PRIVATE_KEY, rail);

const started = Date.now();
let res = null, answer = null, receipt = null;
try {
  res = await payFetch(`${CONFIG.node}/engine/v1/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  answer = await res.json().catch(() => null);
  ({ receipt } = readReceipt(res));
} catch (e) {
  answer = { error: e.message };   // e.g. escrow payment refused: the node's reason, never our signed header
}

console.log(`Rail: ${rail}`);
console.log("HTTP", res?.status ?? "-", `(${Date.now() - started} ms)`);
console.log("Answer:", JSON.stringify(answer, null, 2));
if (receipt) console.log("Receipt:", JSON.stringify(receipt, null, 2));
if (answer?.signal_hash) console.log("Verify:", `${CONFIG.node}/engine/v1/signal/${answer.signal_hash}`);
if (receipt?.tx_hash) console.log("Settlement tx:", `https://sepolia.etherscan.io/tx/${receipt.tx_hash}`);
if (receipt?.receipt_hash && receipt.epoch_id != null)
  console.log("Delivery proof (after the epoch block is recorded):", `${CONFIG.node}/v1/blocks/${receipt.epoch_id}/deliveries/${receipt.receipt_hash}`);

const file = `evidence/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(askEvidence({ request: JSON.parse(body), rail, status: res?.status ?? null, answer, receipt }), null, 2));
console.log("Saved:", file);
