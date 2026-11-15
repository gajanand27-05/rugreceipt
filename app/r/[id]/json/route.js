import { getServerDeps } from "../../../../lib/web/server.mjs";
import { VALID_ID } from "../../../../lib/web/reports.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = await params;
  const report = VALID_ID.test(id) ? await (await getServerDeps()).store.get(id) : null;
  if (!report) return new Response("Report not found", { status: 404 });
  return new Response(JSON.stringify(report, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="rugreceipt-${id}.json"` },
  });
}
