// code/lib/web/stream.mjs: newline-delimited JSON between /api/check and the browser.
export const toLine = (msg) => JSON.stringify(msg) + "\n";

// What CheckForm.jsx shows when fetch() or the stream-reading loop throws.
// `started` is true once the response has arrived (the request may already have been paid for).
export const fetchErrorMessage = (started) => started
  ? "The connection dropped during the check; some checks may have been paid. If it finished, the report was still saved."
  : "Could not reach the server. Nothing new was started; try again.";

// Feed it text chunks as they arrive; it calls onMessage once per complete line.
export function makeLineReader(onMessage) {
  let buf = "";
  return (chunk) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) if (line.trim()) onMessage(JSON.parse(line));
  };
}
