// code/lib/telegraph.mjs: one paid Telegraph request, never throws, never waits forever.
// Cost comes only from the receipt (amount_uusdc). No receipt = costUusdc null ("charge unknown"),
// because a failure or timeout after the x402 payment may already be settled.
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { CONFIG } from "./config.mjs";

export function makePayingFetch(privateKey) {
  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: CONFIG.network, client: new ExactEvmScheme(privateKeyToAccount(privateKey)) }],
    spendControls: { allowedAssets: [{ network: CONFIG.network, asset: CONFIG.usdc, maxAmountPerPayment: CONFIG.maxPerPaymentUusdc }] },
  });
}

function readReceipt(res) {
  const raw = res.headers.get("x-telegraph-receipt");
  if (!raw) return { receipt: null, note: null };
  try { return { receipt: JSON.parse(Buffer.from(raw, "base64").toString()), note: null }; }
  catch { return { receipt: null, note: "receipt header could not be read" }; }
}

export async function buy(payFetch, body, timeoutMs = CONFIG.checkTimeoutMs) {
  const started = Date.now();
  const abort = new AbortController();
  let timer, receipt = null, note = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { abort.abort(); reject(new Error(`timeout after ${timeoutMs} ms`)); }, timeoutMs);
  });
  const done = (ok, answer, error) => ({
    ok, result: answer?.result ?? null, miner: answer?.miner_name ?? null, receipt,
    costUusdc: receipt?.amount_uusdc != null ? Number(receipt.amount_uusdc) : null,
    signal: answer?.signal_hash ?? null, ms: Date.now() - started, error, note,
  });
  try {
    const answer = await Promise.race([(async () => {
      const res = await payFetch(`${CONFIG.node}/engine/v1/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: abort.signal,
      });
      ({ receipt, note } = readReceipt(res));
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })(), timeout]);
    return done(true, answer, null);
  } catch (e) {
    return done(false, null, e.message);
  } finally {
    clearTimeout(timer);
  }
}
