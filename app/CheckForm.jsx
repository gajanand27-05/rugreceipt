"use client";
import { useRef, useState } from "react";
import { makeLineReader, fetchErrorMessage } from "../lib/web/stream.mjs";
import ReportView from "./ReportView.jsx";

// Re-check these with the CLI the day before any demo: small and scam tokens change fast.
const EXAMPLES = [
  { label: "PEPE (big token)", token: "0x6982508145454Ce325dDbE47a25d4ec3d2311933" },
  { label: "Macca (small new token)", token: "0x0A675e411F95db85Fa23e2bCfAb65ecA91a6aD9a" },
  { label: "vensa (known honeypot)", token: "0x5599811ff441f045d64cad51ce4d74462faf7a1d" },
];

export default function CheckForm() {
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [run, setRun] = useState(null);   // { token, name, rows, report, id, error, message, running }
  const inFlight = useRef(false);

  async function check(t = token, n = name) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setToken(t);
      const state = { token: t.trim(), name: n.trim() || null, rows: [], report: null, id: null, error: null, message: null, running: true };
      setRun(state);
      const update = (patch) => setRun((s) => ({ ...s, ...patch }));
      let started = false;
      try {
        const res = await fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t, name: n }) });
        started = true;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        const feed = makeLineReader((m) => {
          if (m.type === "row") setRun((s) => ({ ...s, rows: [...s.rows, m.row] }));
          if (m.type === "done") {
            update({ report: m.report, id: m.id, message: m.message, running: false });
            if (m.id) window.history.replaceState(null, "", `/r/${m.id}`);
          }
          if (m.type === "error") update({ error: m.message, running: false });
        });
        for (;;) { const { value, done } = await reader.read(); if (done) break; feed(value); }
        setRun((s) => (s.running ? { ...s, running: false, error: "The connection closed before the check finished." } : s));
      } catch {
        update({ running: false, error: fetchErrorMessage(started) });
      }
    } finally {
      inFlight.current = false;
    }
  }

  const busy = run?.running;
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); check(); }}>
        <p><label>Token contract address (Ethereum mainnet)<br />
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="0x…" required /></label></p>
        <p><label>Project / team / company name <span className="muted">(optional: adds the sanctions check)</span><br />
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label></p>
        <p><button type="submit" disabled={busy}>{busy ? "Checking…" : "Check"}</button>{" "}
          <span className="muted">Uses Telegraph testnet. Costs about $0.04 test USDC ($0.05 with a name), paid by our agent. Takes 10-60 s.
            Reports are public: anyone with the link can read them, including the name you type.</span></p>
        <p className="muted">Try: {EXAMPLES.map((x) => (
          <button key={x.token} type="button" disabled={busy} onClick={() => { setName(""); check(x.token, ""); }}>{x.label}</button>
        ))}</p>
      </form>
      {run?.error ? <p className="tone-bad">{run.error}</p> : null}
      {run?.message ? <p className="tone-warn">{run.message}</p> : null}
      {run && (!run.error || run.rows.length) ? <ReportView token={run.token} name={run.name} rows={run.rows} report={run.report} running={run.running} /> : null}
      {run?.id ? <p>Share this report: <a href={`/r/${run.id}`}>{typeof window === "undefined" ? "" : window.location.origin}/r/{run.id}</a> · <a href={`/r/${run.id}/json`}>Download evidence JSON</a></p> : null}
    </>
  );
}
