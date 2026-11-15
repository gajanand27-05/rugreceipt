import { showValue, markFor, costText, totalLine } from "../lib/cli.mjs";
import { rowsForDisplay, receiptUrl, verdictTone } from "../lib/web/view.mjs";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export default function ReportView({ token, name, rows, report, running }) {
  const tone = verdictTone(report?.verdict);
  return (
    <section>
      <h2>
        {report?.pool?.symbol ?? "Token"} <span className="muted">({short(token)})</span>
        {name ? <span className="muted"> · name: {name}</span> : null}
      </h2>
      {report?.replay ? <p className="tone-warn"><b>REPLAY:</b> a saved real report played back. No payment was made.</p> : null}
      <p className={`verdict tone-${tone}`}>
        {report ? `${report.verdict}${report.note ? ` (${report.note})` : ""}` : running ? "Checking…" : ""}
      </p>
      {report?.reasons?.length ? <ul>{report.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
      <div className="table-scroll">
        <table>
          <thead><tr><th>Check</th><th>Result</th><th>Provider</th><th>Cost</th><th>State</th><th>Receipt</th></tr></thead>
          <tbody>
            {rowsForDisplay(rows).map((r) => r.pending ? (
              <tr key={r.id}><td>{r.label}</td><td className="muted" colSpan={5}>{running ? "waiting…" : "-"}</td></tr>
            ) : (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td>{showValue(r)}</td>
                <td>{r.miner ?? (r.source === "telegraph" ? "-" : r.source)}</td>
                <td>{costText(r)}</td>
                <td>{markFor(r)}</td>
                <td>{receiptUrl(r) ? <a href={receiptUrl(r)} target="_blank" rel="noreferrer">tx</a> : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report ? (
        <p className="muted">
          {report.wrongCount ? `Data quality: ${report.wrongCount} paid answer(s) looked wrong; the free reference was used instead. ` : ""}
          {totalLine(report)} · checked {new Date(report.checkedAt).toUTCString()} · {report.network}
        </p>
      ) : null}
    </section>
  );
}
