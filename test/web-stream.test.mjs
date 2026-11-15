import { test } from "node:test";
import assert from "node:assert/strict";
import { toLine, makeLineReader } from "../lib/web/stream.mjs";

test("toLine: one JSON object + newline", () => {
  assert.equal(toLine({ type: "row", row: { id: "a" } }), '{"type":"row","row":{"id":"a"}}\n');
});

test("makeLineReader: handles lines split across chunks and several lines per chunk", () => {
  const got = [];
  const feed = makeLineReader((m) => got.push(m));
  feed('{"a":1}\n{"b"');
  feed(':2}\n\n{"c":3}');
  assert.deepEqual(got, [{ a: 1 }, { b: 2 }]);   // {"c":3} has no newline yet
  feed("\n");
  assert.deepEqual(got, [{ a: 1 }, { b: 2 }, { c: 3 }]);
});
