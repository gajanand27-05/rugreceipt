// code/lib/web/server.mjs: real dependencies for the website, chosen from environment variables.
//   RUGRECEIPT_REPLAY=1             → replay a saved report: no wallet, no payments (UI work, demo fallback)
//   EVM_PRIVATE_KEY                 → the paying testnet wallet (server only)
//   BLOB_READ_WRITE_TOKEN           → save reports to Vercel Blob (else: evidence/web-reports/ locally)
//   KV_REST_API_URL/_TOKEN or UPSTASH_REDIS_REST_URL/_TOKEN → shared rate limits (required on Vercel)
//   RUGRECEIPT_PER_IP_PER_HOUR / RUGRECEIPT_PER_DAY → optional cap overrides (defaults in CONFIG.web)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { runTokenCheck } from "../engine.mjs";
import { makePayingFetch } from "../telegraph.mjs";
import { keyProblem } from "../cli.mjs";
import { makeBalanceReader } from "../balances.mjs";
import { replayEngine } from "./replay.mjs";
import { memoryCounter, redisCounter, limitsFromEnv } from "./limits.mjs";
import { fileReportStore, blobReportStore, newReportId } from "./reports.mjs";

const REPLAY_FILE = "evidence/reports/2026-11-14T11-37-44-190Z-PEPE.json";
let deps = null;

async function makeCounter(env) {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const { Redis } = await import("@upstash/redis");
    return redisCounter(new Redis({ url, token }));
  }
  if (env.VERCEL) throw new Error("Rate-limit store missing: connect Upstash Redis to this Vercel project.");
  return memoryCounter();
}

async function makeStore(env) {
  if (env.BLOB_READ_WRITE_TOKEN) {
    const { put, head } = await import("@vercel/blob");
    return blobReportStore({ put, head });
  }
  if (env.VERCEL) throw new Error("Report store missing: connect a Vercel Blob store to this project.");
  return fileReportStore(join(process.cwd(), "evidence", "web-reports"));
}

export async function getServerDeps(env = process.env) {
  if (deps) return deps;
  const [counter, store] = await Promise.all([makeCounter(env), makeStore(env)]);
  if (env.RUGRECEIPT_REPLAY === "1") {
    const report = JSON.parse(readFileSync(join(process.cwd(), REPLAY_FILE), "utf8"));
    return (deps = { mode: "replay", engine: replayEngine(report), engineDeps: {}, counter, limits: limitsFromEnv(env), readBalances: null, store, newId: newReportId });
  }
  const problem = keyProblem(env.EVM_PRIVATE_KEY);
  if (problem) throw new Error(`Server wallet not configured: ${problem.replace(/ Run .*$/, "")}`);
  const { address } = privateKeyToAccount(env.EVM_PRIVATE_KEY);
  return (deps = {
    mode: "live", engine: runTokenCheck, engineDeps: { payFetch: makePayingFetch(env.EVM_PRIVATE_KEY) },
    counter, limits: limitsFromEnv(env), readBalances: makeBalanceReader(address), store, newId: newReportId,
  });
}
