// code/test/miner-limit.test.mjs: per-IP limit on the public miner route (free RPC quota guard).
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryCounter } from "../lib/web/limits.mjs";
import { minerSlot, MINER_PER_IP_PER_MIN } from "../lib/miner-limit.mjs";
import { handleMiner } from "../lib/miner-handler.mjs";

test("30 calls per minute per IP pass, the 31st is refused", async () => {
  assert.equal(MINER_PER_IP_PER_MIN, 30);
  const c = memoryCounter(), now = new Date("2026-11-27T12:00:10Z");
  for (let i = 0; i < 30; i++) assert.equal((await minerSlot(c, "1.2.3.4", now)).ok, true);
  const r = await minerSlot(c, "1.2.3.4", now);
  assert.equal(r.ok, false);
  assert.match(r.message, /30 requests per minute/);
});
test("the limit is per IP and per minute", async () => {
  const c = memoryCounter();
  for (let i = 0; i < 30; i++) await minerSlot(c, "1.2.3.4", new Date("2026-11-27T12:00:10Z"));
  assert.equal((await minerSlot(c, "5.6.7.8", new Date("2026-11-27T12:00:20Z"))).ok, true);
  assert.equal((await minerSlot(c, "1.2.3.4", new Date("2026-11-27T12:01:00Z"))).ok, true);
});
test("a refused call is a 429 with an error, and nothing is simulated", async () => {
  const r = await handleMiner({ subject: "0xabc" }, {
    takeSlot: async () => ({ ok: false, message: "Limit reached: 30 requests per minute per IP." }),
    assess: async () => assert.fail("must not simulate"),
  });
  assert.equal(r.status, 429);
  assert.match(r.body.error, /Limit reached/);
});
test("an allowed call goes through to assess", async () => {
  const r = await handleMiner({ subject: "0xabc" }, { takeSlot: async () => ({ ok: true }), assess: async () => ({ verdict: "LOW" }) });
  assert.equal(r.status, 200);
});
