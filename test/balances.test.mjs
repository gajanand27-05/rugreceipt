import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedCostUusdc, makeBalanceReader } from "../lib/balances.mjs";

test("expectedCostUusdc: 4 paid checks, 5 with a name", () => {
  assert.equal(expectedCostUusdc(null), 40_000);
  assert.equal(expectedCostUusdc("Rosneft Oil Company"), 50_000);
});

const client = { readContract: async () => 8_760_000n };
const ledger = (body, seen = []) => async (url) => { seen.push(url); return { ok: true, json: async () => body }; };

test("makeBalanceReader: wallet usdc from the chain, escrow = the node ledger's `available` (what asks may spend)", async () => {
  const seen = [];
  const read = makeBalanceReader("0xABC", client, ledger({ balance: "2000000", unbilled: "10000", available: "1990000" }, seen));
  assert.deepEqual(await read(), { usdc: 8_760_000, escrow: 1_990_000 });
  assert.match(seen[0], /\/v1\/ledger\/account\/0xabc$/);
});

test("makeBalanceReader: escrow read failure → escrow null, usdc still read", async () => {
  const down = async () => { throw new Error("node down"); };
  assert.deepEqual(await makeBalanceReader("0xabc", client, down)(), { usdc: 8_760_000, escrow: null });
  const bad = async () => ({ ok: false, json: async () => ({}) });
  assert.deepEqual(await makeBalanceReader("0xabc", client, bad)(), { usdc: 8_760_000, escrow: null });
});
