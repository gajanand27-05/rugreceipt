// Makes one paid Telegraph request (x402, ~$0.01 test USDC) and saves the answer + receipt to evidence/.
// Usage: npm run ask -- '{"intent":"CRYPTO_PRICE_USD","params":{"symbol":"BTC"}}'
import { writeFileSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const NODE = "https://devnode.telegraphprotocol.com";
const NETWORK = "eip155:11155111";
const body = process.argv[2] ?? '{"intent":"CRYPTO_PRICE_USD","params":{"symbol":"BTC"}}';

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(privateKeyToAccount(process.env.EVM_PRIVATE_KEY)) }],
  spendControls: {
    allowedAssets: [{ network: NETWORK, asset: "0xcc194e1a843B658526D0D5C431f670028582Ae17", maxAmountPerPayment: "100000" }], // cap $0.10/call
  },
});

const started = Date.now();
const res = await fetchWithPayment(`${NODE}/engine/v1/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});
const answer = await res.json().catch(() => null);
const rawReceipt = res.headers.get("x-telegraph-receipt");
const receipt = rawReceipt && JSON.parse(Buffer.from(rawReceipt, "base64").toString());

console.log("HTTP", res.status, `(${Date.now() - started} ms)`);
console.log("Answer:", JSON.stringify(answer, null, 2));
if (receipt) console.log("Receipt:", JSON.stringify(receipt, null, 2));
if (answer?.signal_hash) console.log("Verify:", `${NODE}/engine/v1/signal/${answer.signal_hash}`);
if (receipt?.tx_hash) console.log("Settlement tx:", `https://sepolia.etherscan.io/tx/${receipt.tx_hash}`);

const file = `evidence/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ request: JSON.parse(body), status: res.status, answer, receipt }, null, 2));
console.log("Saved:", file);
