// code/lib/web/handler.mjs: POST /api/check without Next.js. Validate → rate limit → wallet → engine
// (rows streamed live) → save → done. Every refusal before the engine says "nothing was charged".
import { CONFIG } from "../config.mjs";
import { expectedCostUusdc } from "../balances.mjs";
import { takeSlot } from "./limits.mjs";
import { toLine } from "./stream.mjs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const usd = (u) => `$${(u / 1e6).toFixed(2)}`;

export function parseCheckInput(body) {
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!ADDRESS.test(token)) return { error: "That is not a token address (0x followed by 40 hex characters)." };
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length > CONFIG.web.maxNameLength) return { error: `The name is too long (max ${CONFIG.web.maxNameLength} characters).` };
  return { token, name: name || null };
}

export function handleCheck(body, ip, deps) {
  const { engine, engineDeps, counter, readBalances, store, newId, keepAlive } = deps;
  const encoder = new TextEncoder();
  let open = true;
  let controller;
  const send = (msg) => {
    if (!open) return;
    try { controller.enqueue(encoder.encode(toLine(msg))); } catch { open = false; }
  };
  const finish = () => { if (open) { open = false; try { controller.close(); } catch {} } };
  const refuse = (message) => { send({ type: "error", message, charged: false }); finish(); };

  async function run() {
    const input = parseCheckInput(body);
    if (input.error) return refuse(input.error);

    const slot = await takeSlot(counter, ip).catch(() => null);
    if (!slot) return refuse("The rate limiter is unavailable, so checks are paused. Nothing was charged.");
    if (!slot.ok) return refuse(slot.message);

    if (readBalances) {
      const bal = await readBalances().catch(() => null);
      const need = expectedCostUusdc(input.name);
      if (bal && bal.usdc < need)
        return refuse(`The demo wallet is low on test USDC (${usd(bal.usdc)}, needs ${usd(need)}). Nothing was charged. Please try again later.`);
    }

    // The engine + save run to the end even if the visitor leaves: keepAlive (Next.js after()) holds the function open.
    const work = (async () => {
      const report = await engine(input, engineDeps, (row) => send({ type: "row", row }));
      const id = newId();
      try { await store.save(id, report); return { report, id, message: null }; }
      catch { return { report, id: null, message: "The report could not be saved, so it has no share link. It is shown below in full." }; }
    })();
    keepAlive(work.catch(() => {}));

    try {
      const { report, id, message } = await work;
      send({ type: "done", id, report, message });
    } catch (e) {
      // runTokenCheck throws before paying only in the DexScreener pool step; anything else is unexpected (charge unknown).
      const beforePaying = /pool|DexScreener/i.test(e.message);
      send({ type: "error", message: beforePaying ? `${e.message}. Nothing was charged.` : `The check failed: ${e.message}`, charged: beforePaying ? false : null });
    }
    finish();
  }

  return new ReadableStream({
    start(c) { controller = c; run(); },   // not awaited: rows must flow while the engine runs
    cancel() { open = false; },
  });
}
