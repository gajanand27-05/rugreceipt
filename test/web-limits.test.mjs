import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryCounter, redisCounter, takeSlot } from "../lib/web/limits.mjs";

const limits = { perIpPerHour: 2, perDay: 3 };
const at = (iso) => new Date(iso);

test("takeSlot: per-visitor hourly cap, other visitors unaffected", async () => {
  const c = memoryCounter();
  const t = at("2026-11-20T10:05:00Z");
  assert.equal((await takeSlot(c, "1.1.1.1", t, limits)).ok, true);
  assert.equal((await takeSlot(c, "1.1.1.1", t, limits)).ok, true);
  const third = await takeSlot(c, "1.1.1.1", t, limits);
  assert.equal(third.ok, false);
  assert.match(third.message, /2 checks per hour/);
  assert.equal((await takeSlot(c, "2.2.2.2", t, limits)).ok, true);
});

test("takeSlot: a new hour resets the visitor cap", async () => {
  const c = memoryCounter();
  await takeSlot(c, "1.1.1.1", at("2026-11-20T10:05:00Z"), limits);
  await takeSlot(c, "1.1.1.1", at("2026-11-20T10:06:00Z"), limits);
  assert.equal((await takeSlot(c, "1.1.1.1", at("2026-11-20T11:00:00Z"), limits)).ok, true);
});

test("takeSlot: whole-site daily cap", async () => {
  const c = memoryCounter();
  const t = at("2026-11-20T10:00:00Z");
  for (const ip of ["a", "b", "c"]) assert.equal((await takeSlot(c, ip, t, limits)).ok, true);
  const fourth = await takeSlot(c, "d", t, limits);
  assert.equal(fourth.ok, false);
  assert.match(fourth.message, /daily limit/);
});

test("redisCounter: INCR, and EXPIRE only on the first hit", async () => {
  const calls = [];
  let n = 0;
  const redis = { incr: async (k) => { calls.push(["incr", k]); return ++n; }, expire: async (k, s) => calls.push(["expire", k, s]) };
  const c = redisCounter(redis);
  assert.equal(await c.incr("k", 60), 1);
  assert.equal(await c.incr("k", 60), 2);
  assert.deepEqual(calls, [["incr", "k"], ["expire", "k", 60], ["incr", "k"]]);
});
