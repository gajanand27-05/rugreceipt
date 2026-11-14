// code/lib/pool.mjs: free DexScreener lookup of the token's biggest Ethereum pool.
export async function findMainPool(token, fetchFn = fetch) {
  const res = await fetchFn(`https://api.dexscreener.com/latest/dex/tokens/${token}`);
  if (!res.ok) return null;
  const pairs = ((await res.json()).pairs ?? []).filter((p) => p.chainId === "ethereum");
  if (!pairs.length) return null;
  const p = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  return {
    chain: "ethereum", pool: p.pairAddress, dex: p.dexId,
    symbol: p.baseToken.symbol, name: p.baseToken.name,
    priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
    liquidityUsd: p.liquidity?.usd ?? null,
  };
}
