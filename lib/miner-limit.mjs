// code/lib/miner-limit.mjs: per-IP limit for the public miner route, so nobody can burn our free RPC quota.
// Generous on purpose (the node's grace-period traffic is far below it). Shared Upstash Redis when configured,
// else per-instance memory. Reads only the Redis URL/token from the environment, never a wallet key.
import { memoryCounter, redisCounter } from "./web/limits.mjs";

export const MINER_PER_IP_PER_MIN = 30;

export async function minerSlot(counter, ip, now = new Date()) {
  const n = await counter.incr(`rr:miner:${ip}:${now.toISOString().slice(0, 16)}`, 60);
  return n > MINER_PER_IP_PER_MIN
    ? { ok: false, message: `Limit reached: ${MINER_PER_IP_PER_MIN} requests per minute per IP. Try again in a minute.` }
    : { ok: true };
}

let counter = null;
export async function minerCounter(env) {
  if (counter) return counter;
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const { Redis } = await import("@upstash/redis");
    return (counter = redisCounter(new Redis({ url, token })));
  }
  return (counter = memoryCounter());
}
