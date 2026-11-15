import { notFound } from "next/navigation";
import ReportView from "../../ReportView.jsx";
import { getServerDeps } from "../../../lib/web/server.mjs";
import { VALID_ID } from "../../../lib/web/reports.mjs";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `RugReceipt report ${id}` };
}

export default async function SavedReport({ params }) {
  const { id } = await params;
  if (!VALID_ID.test(id)) notFound();
  const report = await (await getServerDeps()).store.get(id);
  if (!report) notFound();
  return (
    <>
      <ReportView token={report.token} name={report.name} rows={report.rows} report={report} running={false} />
      <p><a href={`/r/${id}/json`}>Download evidence JSON</a> · <a href="/">Check another token</a></p>
    </>
  );
}
