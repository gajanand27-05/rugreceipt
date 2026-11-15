import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newReportId, VALID_ID, fileReportStore, blobReportStore } from "../lib/web/reports.mjs";

test("newReportId: 12 lowercase hex, different each time", () => {
  const a = newReportId(), b = newReportId();
  assert.match(a, VALID_ID);
  assert.notEqual(a, b);
});

test("fileReportStore: save then get; unknown or malformed id → null", async () => {
  const store = fileReportStore(mkdtempSync(join(tmpdir(), "rr-")));
  await store.save("0123456789ab", { verdict: "LIST" });
  assert.deepEqual(await store.get("0123456789ab"), { verdict: "LIST" });
  assert.equal(await store.get("ffffffffffff"), null);
  assert.equal(await store.get("../../.env"), null);
});

test("blobReportStore: public JSON at reports/<id>.json, no random suffix", async () => {
  const puts = [];
  const store = blobReportStore({ put: async (...a) => puts.push(a), head: async () => { throw new Error("unused"); }, fetchFn: fetch });
  await store.save("0123456789ab", { verdict: "REJECT" });
  assert.equal(puts[0][0], "reports/0123456789ab.json");
  assert.deepEqual(JSON.parse(puts[0][1]), { verdict: "REJECT" });
  assert.deepEqual(puts[0][2], { access: "public", contentType: "application/json", addRandomSuffix: false });
});

// Mirrors @vercel/blob's real BlobNotFoundError: `.name` stays "Error" (inherited), only the
// constructor name is "BlobNotFoundError" (see reports.mjs for why the catch checks that).
class BlobNotFoundError extends Error {}

test("blobReportStore.get: found → JSON; not found → null; malformed id never calls Blob", async () => {
  let heads = 0;
  const head = async (path) => {
    heads++;
    if (path === "reports/0123456789ab.json") return { url: "https://blob.example/reports/0123456789ab.json" };
    throw new BlobNotFoundError("not found");
  };
  const fetchFn = async () => ({ ok: true, json: async () => ({ verdict: "CAUTION" }) });
  const store = blobReportStore({ put: async () => {}, head, fetchFn });
  assert.deepEqual(await store.get("0123456789ab"), { verdict: "CAUTION" });
  assert.equal(await store.get("ffffffffffff"), null);
  assert.equal(await store.get("nope"), null);
  assert.equal(heads, 2);
});
