// code/lib/telegraph.mjs: one paid Telegraph request, never throws, never waits forever.
// Two payment rails (TELEGRAPH_PAY): "escrow" (default; signed message against a deposit, no facilitator)
// or "x402" (per-call settlement through facilitator.x402.rs, which has timed out since 18 Nov).
// Cost comes only from the receipt (amount_uusdc). No receipt = costUusdc null ("charge unknown"),
// because a failure or timeout after an x402 payment may already be settled. On escrow a failed
// request is never billed (docs: escrow-inference), so a non-2xx without a receipt costs 0.
import { randomBytes } from "node:crypto";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { CONFIG } from "./config.mjs";

const RAILS = ["escrow", "x402"];
export function railFromEnv(env = process.env) {
  const rail = env.TELEGRAPH_PAY ?? CONFIG.payRail;
  if (!RAILS.includes(rail)) throw new Error(`TELEGRAPH_PAY must be "escrow" or "x402", not "${rail}"`);
  return rail;
}

export function makePayingFetch(privateKey, rail = railFromEnv()) {
  const account = privateKeyToAccount(privateKey);
  const payFetch = rail === "escrow" ? makeEscrowFetch(account) : wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: CONFIG.network, client: new ExactEvmScheme(account) }],
    spendControls: { allowedAssets: [{ network: CONFIG.network, asset: CONFIG.usdc, maxAmountPerPayment: CONFIG.maxPerPaymentUusdc }] },
  });
  payFetch.rail = rail;
  return payFetch;
}

// --- Escrow rail: read the 402 challenge, sign its template with personal_sign, send it once in X-PAYMENT.
export function escrowAccept(challenge) {
  const accept = challenge?.accepts?.find((a) => a.scheme === "escrow");
  if (!accept) throw new Error("this node does not accept escrow payments");
  return accept;
}

export function escrowAuthorization(accept, from, nowSec, nonce = `0x${randomBytes(32).toString("hex")}`) {
  const amount = /Amount:\s*(\d+)\s*uUSDC/.exec(accept.extra?.message ?? "");
  if (!amount) throw new Error("escrow challenge has no Amount line to sign");
  // Lowercase from: the node lowercases before checking. Window 95 s: under the 2 min limit, tolerant of clock drift.
  return { from: from.toLowerCase(), to: accept.payTo, value: amount[1], validAfter: String(nowSec - 5), validBefore: String(nowSec + 90), nonce };
}

export const fillTemplate = (template, a) => template
  .replace("{from}", a.from).replace("{nonce}", a.nonce).replace("{validAfter}", a.validAfter).replace("{validBefore}", a.validBefore);

export const escrowHeader = (network, signature, authorization) =>
  Buffer.from(JSON.stringify({ x402Version: 2, scheme: "escrow", network, payload: { signature, authorization } })).toString("base64");

export function makeEscrowFetch(account, fetchImpl = fetch, now = Date.now) {
  return Object.assign(async (url, init) => {
    const first = await fetchImpl(url, init);
    if (first.status !== 402) return first;   // e.g. 422: params refused before payment
    const accept = escrowAccept(await first.json());
    const authorization = escrowAuthorization(accept, account.address, Math.floor(now() / 1000));
    const signature = await account.signMessage({ message: fillTemplate(accept.extra.message, authorization) });
    const paid = await fetchImpl(url, { ...init, headers: { ...init.headers, "X-PAYMENT": escrowHeader(accept.network, signature, authorization) } });
    if (paid.status !== 402) return paid;
    // Refused (balance, nonce, signature...). No retry: report the node's reason, never our signed header.
    const body = await paid.json().catch(() => null);
    const reason = String(body?.reason ?? body?.error ?? "no reason given").slice(0, 300);
    throw Object.assign(new Error(`escrow payment refused (HTTP 402): ${reason}`), { notCharged: true });
  }, { rail: "escrow" });
}

function readReceipt(res) {
  const raw = res.headers.get("x-telegraph-receipt") ?? res.headers.get("x-payment-response");
  if (!raw) return { receipt: null, note: null };
  try { return { receipt: JSON.parse(Buffer.from(raw, "base64").toString()), note: null }; }
  catch { return { receipt: null, note: "receipt header could not be read" }; }
}

export async function buy(payFetch, body, timeoutMs = CONFIG.checkTimeoutMs) {
  const escrow = payFetch.rail === "escrow";
  const started = Date.now();
  const abort = new AbortController();
  let timer, receipt = null, note = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { abort.abort(); reject(new Error(`timeout after ${timeoutMs} ms`)); }, timeoutMs);
  });
  let notBilled = false;   // escrow: the node answered with a failure, or refused the payment
  const done = (ok, answer, error) => {
    // When every miner fails, the node answers itself ("last resort", subnet "openai", cost 0, no receipt;
    // seen 19 Nov). That is not Telegraph miner intelligence: flag it, never bill it, never trust its value.
    const fallback = ok && !receipt && (answer?.miner_id === "openai" || answer?.miner_name === "openai" || Number(answer?.cost_usd) === 0);
    return {
      ok, fallback, result: answer?.result ?? null, miner: answer?.miner_name ?? null, receipt,
      costUusdc: receipt?.amount_uusdc != null ? Number(receipt.amount_uusdc) : notBilled || fallback ? 0 : null,
      signal: answer?.signal_hash ?? null, ms: Date.now() - started, error,
      note: fallback ? `node fallback '${answer?.miner_name ?? answer?.miner_id ?? "?"}' (no miner answered): no Telegraph receipt, not billed` : note,
    };
  };
  try {
    const answer = await Promise.race([(async () => {
      const res = await payFetch(`${CONFIG.node}/engine/v1/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: abort.signal,
      });
      ({ receipt, note } = readReceipt(res));
      if (res.status !== 200) { notBilled = escrow; throw new Error(`HTTP ${res.status}`); }
      return res.json();
    })(), timeout]);
    return done(true, answer, null);
  } catch (e) {
    if (e.notCharged) notBilled = true;
    return done(false, null, e.message);
  } finally {
    clearTimeout(timer);
  }
}

// What ask.mjs saves: the request, the answer and the receipt only. Never the X-PAYMENT header or its signature.
export const askEvidence = ({ request, rail, status, answer, receipt }) => ({ request, rail, status, answer, receipt });
export { readReceipt };
