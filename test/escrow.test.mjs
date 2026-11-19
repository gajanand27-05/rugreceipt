// code/test/escrow.test.mjs: the escrow payment rail (no facilitator). Offline: fake node, throwaway key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { escrowAccept, escrowAuthorization, fillTemplate, escrowHeader, makeEscrowFetch, makePayingFetch, railFromEnv, buy, askEvidence, readReceipt } from "../lib/telegraph.mjs";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";   // well-known test key, never funded
const account = privateKeyToAccount(KEY);
const DIAMOND = "0x72a70e949362670bf8bcead24efc5b8f950aa08b";
const TEMPLATE = `Telegraph Escrow Payment\n\nWallet: {from}\nPay To: ${DIAMOND}\nNetwork: eip155:11155111\nAmount: 10000 uUSDC\nResource: /v1/ask\nNonce: {nonce}\nValid After: {validAfter}\nValid Before: {validBefore}`;
const ESCROW = { scheme: "escrow", network: "eip155:11155111", payTo: DIAMOND, price: "$0.01", extra: { message: TEMPLATE, resource: "/v1/ask" } };
const CHALLENGE = { error: "payment required", accepts: [{ scheme: "exact", network: "eip155:11155111", payTo: DIAMOND }, ESCROW] };
const NOW = 1_795_000_000;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
const unb64 = (s) => JSON.parse(Buffer.from(s, "base64").toString());

// A fake node: records every call, answers from a script of responses.
function fakeNode(...responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = responses[calls.length - 1] ?? { status: 500, body: {} };
    return { status: r.status, headers: { get: (h) => r.headers?.[h.toLowerCase()] ?? null }, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { calls, fetchImpl };
}
const challenge = { status: 402, body: CHALLENGE };
const receipt = { receipt_hash: "0xrh", rail: "escrow", amount_uusdc: "10000", epoch_id: 20, settlement: "epoch", chain: "telegraph" };
const served = { status: 200, headers: { "x-payment-response": b64(receipt) }, body: { miner_name: "Cp", result: { price_usd: 1 }, signal_hash: "0xs" } };

test("escrowAccept picks the escrow entry, and says so clearly when the node offers none", () => {
  assert.equal(escrowAccept(CHALLENGE), ESCROW);
  assert.throws(() => escrowAccept({ accepts: [{ scheme: "exact" }] }), /does not accept escrow/);
  assert.throws(() => escrowAccept(null), /does not accept escrow/);
});

test("authorization: value from the template's Amount line, lowercase from, to = payTo", () => {
  const a = escrowAuthorization(ESCROW, account.address, NOW);
  assert.equal(a.value, "10000");
  assert.equal(a.from, account.address.toLowerCase());
  assert.equal(a.to, DIAMOND);
  assert.throws(() => escrowAuthorization({ ...ESCROW, extra: { message: "no amount" } }, account.address, NOW), /Amount/);
});

test("authorization window: valid from now-5 s to now+90 s (under the node's 2 min limit)", () => {
  const a = escrowAuthorization(ESCROW, account.address, NOW);
  assert.equal(a.validAfter, String(NOW - 5));
  assert.equal(a.validBefore, String(NOW + 90));
  assert.ok(Number(a.validBefore) - Number(a.validAfter) < 120);
});

test("nonce: 32-byte 0x hex, different every time", () => {
  const a = escrowAuthorization(ESCROW, account.address, NOW), b = escrowAuthorization(ESCROW, account.address, NOW);
  assert.match(a.nonce, /^0x[0-9a-f]{64}$/);
  assert.notEqual(a.nonce, b.nonce);
});

test("fillTemplate fills every placeholder and keeps the rest (incl. Network) verbatim", () => {
  const a = escrowAuthorization(ESCROW, account.address, NOW);
  const msg = fillTemplate(TEMPLATE, a);
  assert.doesNotMatch(msg, /[{}]/);
  assert.match(msg, new RegExp(`Wallet: ${a.from}\n`));
  assert.match(msg, new RegExp(`Nonce: ${a.nonce}\n`));
  assert.match(msg, /Network: eip155:11155111\n/);
  assert.equal(msg.replace(a.from, "{from}").replace(a.nonce, "{nonce}").replace(`After: ${a.validAfter}`, "After: {validAfter}").replace(`Before: ${a.validBefore}`, "Before: {validBefore}"), TEMPLATE);
});

test("X-PAYMENT decodes to the documented shape", () => {
  const a = escrowAuthorization(ESCROW, account.address, NOW);
  assert.deepEqual(unb64(escrowHeader("eip155:11155111", "0xsig", a)), {
    x402Version: 2, scheme: "escrow", network: "eip155:11155111", payload: { signature: "0xsig", authorization: a },
  });
});

test("escrow fetch: 402 challenge → one signed re-POST with the same body; the signature recovers our address", async () => {
  const node = fakeNode(challenge, served);
  const pay = makeEscrowFetch(account, node.fetchImpl, () => NOW * 1000);
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"intent":"X"}' };
  const res = await pay("https://node/engine/v1/ask", init);
  assert.equal(res.status, 200);
  assert.equal(node.calls.length, 2);
  assert.equal(node.calls[0].init.headers["X-PAYMENT"], undefined);
  assert.equal(node.calls[1].init.body, init.body);
  assert.equal(node.calls[1].init.headers["Content-Type"], "application/json");
  const { payload } = unb64(node.calls[1].init.headers["X-PAYMENT"]);
  assert.ok(await verifyMessage({ address: account.address, message: fillTemplate(TEMPLATE, payload.authorization), signature: payload.signature }));
});

test("escrow fetch: a non-402 first answer (e.g. 422 params refused before payment) is returned as is, unsigned", async () => {
  const node = fakeNode({ status: 422, body: { error: "params" } });
  const res = await makeEscrowFetch(account, node.fetchImpl)("https://node/engine/v1/ask", { method: "POST", headers: {}, body: "{}" });
  assert.equal(res.status, 422);
  assert.equal(node.calls.length, 1);
});

test("escrow fetch: a second 402 throws with the node's reason, never the signed header, and never POSTs a third time", async () => {
  const refused = { status: 402, body: { error: "payment required", reason: "insufficient escrow for delivery: unbilled=0 μUSDC + price=10000 μUSDC > balance=0 μUSDC" + "x".repeat(1000) } };
  const node = fakeNode(challenge, refused, served);
  const pay = makeEscrowFetch(account, node.fetchImpl, () => NOW * 1000);
  const err = await pay("https://node/engine/v1/ask", { method: "POST", headers: {}, body: "{}" }).then(() => null, (e) => e);
  assert.match(err.message, /refused.*insufficient escrow/);
  assert.ok(err.message.length < 400);
  const header = node.calls[1].init.headers["X-PAYMENT"];
  const { payload } = unb64(header);
  assert.ok(!err.message.includes(header) && !err.message.includes(payload.signature));
  assert.equal(err.notCharged, true);
  assert.equal(node.calls.length, 2);
});

test("buy over escrow: receipt from X-PAYMENT-RESPONSE, exact cost, and no signature anywhere in the result", async () => {
  const node = fakeNode(challenge, served);
  const pay = makeEscrowFetch(account, node.fetchImpl, () => NOW * 1000);
  const r = await buy(pay, { intent: "X" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.receipt, receipt);
  assert.equal(r.costUusdc, 10000);
  const { payload } = unb64(node.calls[1].init.headers["X-PAYMENT"]);
  const saved = JSON.stringify(r);
  assert.ok(!saved.includes(payload.signature) && !/signature|x-payment"/i.test(saved));
});

test("buy over escrow: a failed request without a receipt is not billed (cost 0); a refused payment too", async () => {
  const failed = await buy(makeEscrowFetch(account, fakeNode(challenge, { status: 500, body: {} }).fetchImpl), { intent: "X" });
  assert.equal(failed.ok, false);
  assert.equal(failed.costUusdc, 0);
  const refused = await buy(makeEscrowFetch(account, fakeNode(challenge, { status: 402, body: { reason: "nonce" } }).fetchImpl), { intent: "X" });
  assert.equal(refused.ok, false);
  assert.equal(refused.costUusdc, 0);
});

test("buy over escrow: a timeout stays cost unknown (the node may still serve and bill it)", async () => {
  const pay = makeEscrowFetch(account, (_u, init) => (init.headers["X-PAYMENT"] ? new Promise(() => {}) : Promise.resolve({ status: 402, headers: { get: () => null }, json: async () => CHALLENGE })));
  const r = await buy(pay, { intent: "X" }, 20);
  assert.equal(r.ok, false);
  assert.equal(r.costUusdc, null);
});

test("rail switch: escrow by default, TELEGRAPH_PAY=x402 keeps x402, anything else is refused", () => {
  assert.equal(railFromEnv({}), "escrow");
  assert.equal(railFromEnv({ TELEGRAPH_PAY: "x402" }), "x402");
  assert.throws(() => railFromEnv({ TELEGRAPH_PAY: "escrw" }), /TELEGRAPH_PAY/);
  assert.equal(makePayingFetch(KEY, "escrow").rail, "escrow");
  assert.equal(makePayingFetch(KEY, "x402").rail, "x402");
});

test("askEvidence keeps request, rail, status, answer and receipt only: no signature or payment header", () => {
  const e = askEvidence({ request: { intent: "X" }, rail: "escrow", status: 200, answer: { a: 1 }, receipt, signature: "0xsig", headers: { "X-PAYMENT": "abc" } });
  assert.deepEqual(Object.keys(e), ["request", "rail", "status", "answer", "receipt"]);
  assert.doesNotMatch(JSON.stringify(e), /signature|X-PAYMENT|0xsig/);
});

test("readReceipt reads the escrow header (X-PAYMENT-RESPONSE) as well as x402's (X-TELEGRAPH-RECEIPT)", () => {
  const res = (h) => ({ headers: { get: (k) => h[k] ?? null } });
  assert.deepEqual(readReceipt(res({ "x-payment-response": b64(receipt) })).receipt, receipt);
  assert.deepEqual(readReceipt(res({ "x-telegraph-receipt": b64({ tx_hash: "0xt" }) })).receipt, { tx_hash: "0xt" });
});
