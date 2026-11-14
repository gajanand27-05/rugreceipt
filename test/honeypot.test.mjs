// code/test/honeypot.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkHoneypot } from "../lib/honeypot.mjs";

const fake = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 503, json: async () => body });

test("a failed sell simulation is a honeypot, with the reason and taxes", async () => {
  const r = await checkHoneypot("0xT", fake({ token: { totalHolders: 38 }, simulationSuccess: true,
    honeypotResult: { isHoneypot: true, honeypotReason: "TRANSFER_FROM_FAILED" }, simulationResult: { buyTax: 0, sellTax: 100 } }));
  assert.deepEqual(r, { status: "honeypot", reason: "TRANSFER_FROM_FAILED", buyTax: 0, sellTax: 100, holders: 38 });
});
test("sellable but sell tax over the limit is high_tax", async () => {
  const r = await checkHoneypot("0xT", fake({ simulationSuccess: true, honeypotResult: { isHoneypot: false }, simulationResult: { buyTax: 5, sellTax: 25 } }));
  assert.equal(r.status, "high_tax");
  assert.equal(r.sellTax, 25);
});
test("PEPE-like token is ok and gives the holder count", async () => {
  const r = await checkHoneypot("0xT", fake({ token: { totalHolders: 572538 }, simulationSuccess: true, honeypotResult: { isHoneypot: false }, simulationResult: { buyTax: 0, sellTax: 0 } }));
  assert.deepEqual(r, { status: "ok", reason: null, buyTax: 0, sellTax: 0, holders: 572538 });
});
test("no simulation (e.g. unsupported v4 pool, empty {}) is unknown, not ok", async () => {
  assert.equal((await checkHoneypot("0xT", fake({}))).status, "unknown");
});
test("an HTTP error throws (the engine turns it into 'not checked')", async () => {
  await assert.rejects(checkHoneypot("0xT", fake({}, false)), /honeypot.is HTTP 503/);
});
