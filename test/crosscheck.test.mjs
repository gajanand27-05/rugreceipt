// code/test/crosscheck.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, effectiveValue } from "../lib/crosscheck.mjs";

test("numbers within 10% are confirmed", () => {
  assert.equal(compare(9544.88, 9544.88, "number"), "confirmed");
  assert.equal(compare(105, 100, "number"), "confirmed");
});
test("numbers more than 10% apart look wrong (Macca price case)", () => {
  assert.equal(compare(0.0021039, 0.00001704, "number"), "looks_wrong");
});
test("missing provider value is no_answer", () => {
  assert.equal(compare(null, 100, "number"), "no_answer");
  assert.equal(compare(undefined, null, "number"), "no_answer");
});
test("no reference means unchecked", () => {
  assert.equal(compare(601904, null, "number"), "unchecked");
});
test("booleans must match exactly", () => {
  assert.equal(compare(true, true, "boolean"), "confirmed");
  assert.equal(compare(false, true, "boolean"), "looks_wrong");
});
test("effective value prefers the reference when the provider looks wrong or failed", () => {
  assert.equal(effectiveValue("looks_wrong", 0.0021, 0.000017), 0.000017);
  assert.equal(effectiveValue("no_answer", null, 9544), 9544);
  assert.equal(effectiveValue("confirmed", 101, 100), 101);
  assert.equal(effectiveValue("unchecked", 601904, null), 601904);
});
test("a reference of 0 makes any non-zero answer look wrong (decided, not an accident)", () => {
  assert.equal(compare(5, 0, "number"), "looks_wrong");
  assert.equal(compare(0, 0, "number"), "confirmed");
});
