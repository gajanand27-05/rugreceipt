import { handleMiner } from "../../../../lib/miner-handler.mjs";
import { assess } from "../../../../lib/sim-assess.mjs";
import { makeRpc, simulateToken } from "../../../../lib/sim-run.mjs";
import { fetchRealSells } from "../../../../lib/sim-logs.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;   // target p95 ≤ 8 s (task4-miner-plan.md R6)

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const rpc = makeRpc();
  const deps = { assess: (s) => assess(s, { rpc, simulate: simulateToken, realSells: (t, p, b) => fetchRealSells(t, p, rpc, b) }) };
  const r = await handleMiner(body, deps);
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
