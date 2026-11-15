import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCheckInput, handleCheck } from "../lib/web/handler.mjs";
import { memoryCounter } from "../lib/web/limits.mjs";

const PEPE = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";
const rows = [{ id: "liquidity" }, { id: "holders" }];

async function readAll(stream) {
  const text = await new Response(stream).text();
  return text.trim().split("\n").map((l) => JSON.parse(l));
}

function makeDeps(over = {}) {
  const saved = new Map(), kept = [];
  const deps = {
    engine: async (_input, _d, onRow) => { for (const r of rows) onRow(r); return { verdict: "LIST", rows }; },
    engineDeps: {}, counter: memoryCounter(),
    readBalances: async () => ({ usdc: 9_000_000, escrow: 0 }),
    store: { save: async (id, r) => saved.set(id, r), get: async (id) => saved.get(id) ?? null },
    newId: () => "0123456789ab",
    keepAlive: (p) => kept.push(p),
    ...over,
  };
  return { deps, saved, kept };
}

test("parseCheckInput: address required, name trimmed, blank name → null, long name refused", () => {
  assert.deepEqual(parseCheckInput({ token: PEPE }), { token: PEPE, name: null });
  assert.deepEqual(parseCheckInput({ token: PEPE, name: "  Rosneft Oil Company " }), { token: PEPE, name: "Rosneft Oil Company" });
  assert.deepEqual(parseCheckInput({ token: PEPE, name: "   " }), { token: PEPE, name: null });
  assert.match(parseCheckInput({ token: "0x123" }).error, /not a token address/i);
  assert.match(parseCheckInput(null).error, /not a token address/i);
  assert.match(parseCheckInput({ token: PEPE, name: "x".repeat(101) }).error, /100 characters/);
});

test("happy path: rows stream in order, then done with the saved id", async () => {
  const { deps, saved, kept } = makeDeps();
  const msgs = await readAll(handleCheck({ token: PEPE }, "1.1.1.1", deps));
  assert.deepEqual(msgs.map((m) => m.type), ["row", "row", "done"]);
  assert.deepEqual(msgs.slice(0, 2).map((m) => m.row.id), ["liquidity", "holders"]);
  assert.equal(msgs[2].id, "0123456789ab");
  assert.equal(msgs[2].report.verdict, "LIST");
  assert.equal(saved.get("0123456789ab").verdict, "LIST");
  assert.equal(kept.length, 1);
});

test("bad input: one error line, charged:false, engine and limiter never called", async () => {
  let engineCalls = 0, counted = 0;
  const { deps } = makeDeps({ engine: async () => { engineCalls++; }, counter: { incr: async () => ++counted } });
  const msgs = await readAll(handleCheck({ token: "nope" }, "1.1.1.1", deps));
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].type, "error");
  assert.equal(msgs[0].charged, false);
  assert.equal(engineCalls + counted, 0);
});

test("rate limited: error with the limiter's message, engine not called", async () => {
  let engineCalls = 0;
  const { deps } = makeDeps({ engine: async () => { engineCalls++; } });
  const counter = memoryCounter();   // this visitor already used 10 checks this hour
  for (let i = 0; i < 10; i++) await counter.incr(`rr:ip:9.9.9.9:${new Date().toISOString().slice(0, 13)}`, 3600);
  const msgs = await readAll(handleCheck({ token: PEPE }, "9.9.9.9", { ...deps, counter }));
  assert.equal(msgs[0].type, "error");
  assert.match(msgs[0].message, /per hour/);
  assert.equal(engineCalls, 0);
});

test("limiter down: refuse (protect the wallet), nothing charged", async () => {
  const { deps } = makeDeps({ counter: { incr: async () => { throw new Error("redis down"); } } });
  const [msg] = await readAll(handleCheck({ token: PEPE }, "1.1.1.1", deps));
  assert.equal(msg.type, "error");
  assert.equal(msg.charged, false);
  assert.match(msg.message, /rate limiter/i);
});

test("wallet too low: refuse before paying", async () => {
  const { deps } = makeDeps({ readBalances: async () => ({ usdc: 30_000, escrow: 0 }) });
  const [msg] = await readAll(handleCheck({ token: PEPE }, "1.1.1.1", deps));
  assert.equal(msg.type, "error");
  assert.equal(msg.charged, false);
  assert.match(msg.message, /test USDC/);
});

test("balance read fails: continue (the engine still caps every payment)", async () => {
  const { deps } = makeDeps({ readBalances: async () => { throw new Error("rpc"); } });
  const msgs = await readAll(handleCheck({ token: PEPE }, "1.1.1.1", deps));
  assert.equal(msgs.at(-1).type, "done");
});

test("engine stops before paying (no pool): error, charged:false, message kept", async () => {
  const { deps } = makeDeps({ engine: async () => { throw new Error("No Ethereum pool where this token is the main (base) token"); } });
  const [msg] = await readAll(handleCheck({ token: PEPE }, "1.1.1.1", deps));
  assert.equal(msg.type, "error");
  assert.equal(msg.charged, false);
  assert.match(msg.message, /No Ethereum pool/);
  const down = makeDeps({ engine: async () => { throw new Error("DexScreener lookup failed: HTTP 503"); } }).deps;
  const [msg2] = await readAll(handleCheck({ token: PEPE }, "1.1.1.1", down));
  assert.equal(msg2.charged, false);
});

test("saving fails: done with id null and the report, plus a message", async () => {
  const { deps } = makeDeps({ store: { save: async () => { throw new Error("blob down"); } } });
  const done = (await readAll(handleCheck({ token: PEPE }, "1.1.1.1", deps))).at(-1);
  assert.equal(done.type, "done");
  assert.equal(done.id, null);
  assert.equal(done.report.verdict, "LIST");
  assert.match(done.message, /could not be saved/);
});

test("visitor leaves mid-check: the paid report is still saved", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { deps, saved, kept } = makeDeps({
    engine: async (_i, _d, onRow) => { onRow(rows[0]); await gate; onRow(rows[1]); return { verdict: "CAUTION", rows }; },
  });
  const reader = handleCheck({ token: PEPE }, "1.1.1.1", deps).getReader();
  await reader.read();          // first row arrives
  await reader.cancel();        // tab closed
  release();
  await kept[0];
  assert.equal(saved.get("0123456789ab").verdict, "CAUTION");
});
