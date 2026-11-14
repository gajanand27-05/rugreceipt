// code/test/sanctions.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSdn, matchSdn } from "../lib/sanctions.mjs";

const csv = `36,"AEROCARIBBEAN AIRLINES",-0- ,"CUBA",-0- 
9999,"OPEN JOINT-STOCK COMPANY ROSNEFT OIL COMPANY",-0- ,"UKRAINE-EO13662",-0- 
`;

test("parses names from the SDN csv", () => {
  assert.deepEqual(parseSdn(csv), ["AEROCARIBBEAN AIRLINES", "OPEN JOINT STOCK COMPANY ROSNEFT OIL COMPANY"]);
});
test("matches a listed entity by contained name, ignoring case and punctuation", () => {
  assert.deepEqual(matchSdn("Rosneft Oil Company", parseSdn(csv)),
    { matched: true, hit: "OPEN JOINT STOCK COMPANY ROSNEFT OIL COMPANY" });
});
test("does not match an unlisted name", () => {
  assert.deepEqual(matchSdn("Pepe Team", parseSdn(csv)), { matched: false, hit: null });
});
test("ignores names shorter than 4 characters to avoid junk matches", () => {
  assert.deepEqual(matchSdn("AE", parseSdn(csv)), { matched: false, hit: null });
});
test("one-word name only matches a whole listed name (Tether vs ABAN TETHER EXCHANGE)", () => {
  const names = ["ABAN TETHER EXCHANGE", "HAMAS"];
  assert.deepEqual(matchSdn("Tether", names), { matched: false, hit: null });
  assert.deepEqual(matchSdn("Hamas", names), { matched: true, hit: "HAMAS" });
});
test("multi-word names match on whole words only", () => {
  const names = ["LAZARUS GROUP", "SOVCOMFLOT"];
  assert.deepEqual(matchSdn("Lazarus Group", names), { matched: true, hit: "LAZARUS GROUP" });
  assert.deepEqual(matchSdn("Lazarus Groups Ltd", names), { matched: false, hit: null });
  assert.deepEqual(matchSdn("Sovcomflot Shipping", names), { matched: false, hit: null }); // one-word listed name inside a longer query is too loose
});
test("one word of 7+ letters also matches the first word of a listed name (Garantex)", () => {
  const names = ["GARANTEX EUROPE OU", "BANK MELLI IRAN", "ABAN TETHER EXCHANGE"];
  assert.deepEqual(matchSdn("Garantex", names), { matched: true, hit: "GARANTEX EUROPE OU" });
  assert.deepEqual(matchSdn("Bank", names), { matched: false, hit: null });   // too generic
});
