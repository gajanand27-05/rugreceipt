// code/lib/web/limits.mjs: fixed-window rate limits (per visitor per hour, whole site per UTC day).
// Production uses Redis (shared by all server instances); memoryCounter is for local dev and tests.
import { CONFIG } from "../config.mjs";

export function memoryCounter() {
  const hits = new Map();
  return {
    async incr(key, ttlSec) {
      const now = Date.now();
      const e = hits.get(key);
      if (!e || e.until <= now) { hits.set(key, { n: 1, until: now + ttlSec * 1000 }); return 1; }
      return ++e.n;
    },
  };
}

export function redisCounter(redis) {
  return {
    async incr(key, ttlSec) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, ttlSec);
      return n;
    },
  };
}

export async function takeSlot(counter, ip, now = new Date(), limits = CONFIG.web) {
  const iso = now.toISOString();
  const mine = await counter.incr(`rr:ip:${ip}:${iso.slice(0, 13)}`, 3600);
  if (mine > limits.perIpPerHour)
    return { ok: false, message: `Limit reached: ${limits.perIpPerHour} checks per hour per visitor. Nothing was charged. Try again later.` };
  const all = await counter.incr(`rr:day:${iso.slice(0, 10)}`, 86400);
  if (all > limits.perDay)
    return { ok: false, message: `The demo wallet's daily limit (${limits.perDay} checks) is reached. Nothing was charged. Try again tomorrow (UTC) or run RugReceipt yourself from the GitHub repo.` };
  return { ok: true };
}
