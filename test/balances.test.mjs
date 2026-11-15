import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedCostUusdc, makeBalanceReader } from "../lib/balances.mjs";

test("expectedCostUusdc: 4 paid checks, 5 with a name", () => {
  assert.equal(expectedCostUusdc(null), 40_000);
  assert.equal(expectedCostUusdc("Rosneft Oil Company"), 50_000);
});

test("makeBalanceReader: usdc and escrow as numbers", async () => {
  const client = { readContract: async ({ functionName }) => (functionName === "balanceOf" ? 8_760_000n : 50_000n) };
  assert.deepEqual(await makeBalanceReader("0xabc", client)(), { usdc: 8_760_000, escrow: 50_000 });
});

test("makeBalanceReader: escrow read failure → escrow null, usdc still read", async () => {
  const client = { readContract: async ({ functionName }) => { if (functionName !== "balanceOf") throw new Error("rpc"); return 1n; } };
  assert.deepEqual(await makeBalanceReader("0xabc", client)(), { usdc: 1, escrow: null });
});
