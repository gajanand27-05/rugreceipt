// code/test/pool.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findMainPool } from "../lib/pool.mjs";

const fakeFetch = (body) => async () => ({ ok: true, json: async () => body });

test("picks the Ethereum pair with the most liquidity", async () => {
  const body = { pairs: [
    { chainId: "base", dexId: "x", pairAddress: "0xbase", baseToken: { address: "0xToken", symbol: "PEPE", name: "Pepe" }, priceUsd: "1", liquidity: { usd: 9e9 } },
    { chainId: "ethereum", dexId: "uniswap", pairAddress: "0xsmall", baseToken: { address: "0xToken", symbol: "PEPE", name: "Pepe" }, priceUsd: "0.0000045", liquidity: { usd: 1000 } },
    { chainId: "ethereum", dexId: "uniswap", pairAddress: "0xbig", baseToken: { address: "0xToken", symbol: "PEPE", name: "Pepe" }, priceUsd: "0.0000045", liquidity: { usd: 28e6 } },
  ] };
  assert.deepEqual(await findMainPool("0xtoken", fakeFetch(body)),
    { chain: "ethereum", pool: "0xbig", dex: "uniswap", symbol: "PEPE", name: "Pepe", priceUsd: 0.0000045, liquidityUsd: 28e6 });
});
test("returns null when the token has no Ethereum pair", async () => {
  assert.equal(await findMainPool("0xtoken", fakeFetch({ pairs: null })), null);
});
test("ignores pairs where the token is the quote side", async () => {
  const body = { pairs: [
    { chainId: "ethereum", dexId: "uniswap", pairAddress: "0xquote", baseToken: { address: "0xweth", symbol: "WETH", name: "Wrapped Ether" }, quoteToken: { address: "0xtoken" }, priceUsd: "3000", liquidity: { usd: 9e9 } },
    { chainId: "ethereum", dexId: "uniswap", pairAddress: "0xbase", baseToken: { address: "0xTOKEN", symbol: "PEPE", name: "Pepe" }, priceUsd: "0.0000045", liquidity: { usd: 1000 } },
  ] };
  assert.equal((await findMainPool("0xtoken", fakeFetch(body))).pool, "0xbase");
});
test("a network error becomes a clear message", async () => {
  await assert.rejects(findMainPool("0xtoken", async () => { throw new Error("ECONNRESET"); }), /DexScreener lookup failed: ECONNRESET/);
});
