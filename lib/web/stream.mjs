// code/lib/web/stream.mjs: newline-delimited JSON between /api/check and the browser.
export const toLine = (msg) => JSON.stringify(msg) + "\n";

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
