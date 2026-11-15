// code/lib/web/replay.mjs: plays a saved report back row by row. No network, no payment.
// Used for UI work (RUGRECEIPT_REPLAY=1) and as a safe demo fallback. The report says replay: true.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function replayEngine(report, delayMs = 400, sleep = wait) {
  return async (_input, _deps, onRow = () => {}) => {
    for (const row of report.rows) {
      await sleep(delayMs);
      onRow(row);
    }
    return { ...report, replay: true };
  };
}
