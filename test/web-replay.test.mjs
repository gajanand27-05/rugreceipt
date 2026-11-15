import { test } from "node:test";
import assert from "node:assert/strict";
import { replayEngine } from "../lib/web/replay.mjs";

const report = { verdict: "LIST", rows: [{ id: "liquidity" }, { id: "holders" }], name: null, checkedAt: "2026-11-14T11:37:44.190Z" };

test("replayEngine: emits every row in order, then returns the report marked replay", async () => {
  const seen = [];
  const run = replayEngine(report, 0, async () => {});
  const out = await run({ token: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", name: null }, {}, (r) => seen.push(r.id));
  assert.deepEqual(seen, ["liquidity", "holders"]);
  assert.equal(out.replay, true);
  assert.equal(out.verdict, "LIST");
});

test("replayEngine: waits between rows", async () => {
  const waits = [];
  await replayEngine(report, 400, async (ms) => waits.push(ms))({ token: "x" }, {}, () => {});
  assert.deepEqual(waits, [400, 400]);
});
