import { after } from "next/server";
import { handleCheck } from "../../../lib/web/handler.mjs";
import { getServerDeps } from "../../../lib/web/server.mjs";
import { toLine } from "../../../lib/web/stream.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;   // one check ≈ 75 s worst case (pool 15 + free 15 + paid 45)

const HEADERS = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" };

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  let deps;
  try { deps = await getServerDeps(); }
  catch (e) { return new Response(toLine({ type: "error", message: `${e.message} Nothing was charged.`, charged: false }), { headers: HEADERS }); }
  return new Response(handleCheck(body, ip, { ...deps, keepAlive: (p) => after(p) }), { headers: HEADERS });
}
