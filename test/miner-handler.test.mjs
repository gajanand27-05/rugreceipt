// code/test/miner-handler.test.mjs: POST /api/miner/fraud (task4-miner-plan.md items 2, 3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleMiner } from "../lib/miner-handler.mjs";

const answer = { subject: "s", verdict: "LOW", risk_score: 0.15, signals: [], summary: "x" };

test("a subject gets 200 with the assessment", async () => {
  let got = null;
  const r = await handleMiner({ subject: "0xabc" }, { assess: async (s) => { got = s; return answer; } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, answer);
  assert.equal(got, "0xabc");
});
test("a missing body or subject is assessed as empty text (INCONCLUSIVE comes from assess), still 200", async () => {
  let got = null;
  const r = await handleMiner(null, { assess: async (s) => { got = s; return answer; } });
  assert.equal(r.status, 200);
  assert.equal(got, "");
});
test("an RPC outage is a 503 with an error message (the node does not bill a failed call)", async () => {
  const r = await handleMiner({ subject: "0xabc" }, { assess: async () => { throw Object.assign(new Error("all RPCs failed"), { code: "rpc_unavailable" }); } });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /unavailable/i);
});
test("any other error is a 500 with a message, never a made-up verdict", async () => {
  const r = await handleMiner({ subject: "0xabc" }, { assess: async () => { throw new Error("boom"); } });
  assert.equal(r.status, 500);
  assert.equal(r.body.verdict, undefined);
});
test("the miner code never touches the wallet key or the paid Telegraph client", () => {
  for (const f of ["lib/miner-handler.mjs", "lib/sim-assess.mjs", "lib/sim-run.mjs", "lib/sim-logs.mjs", "lib/sim-verdict.mjs", "lib/sim-realsells.mjs", "app/api/miner/fraud/route.js"]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /EVM_PRIVATE_KEY|process\.env|telegraph\.mjs|config\.mjs|web\/server\.mjs/, f);
  }
});
