// code/lib/pool.mjs: free DexScreener lookup of the token's biggest Ethereum pool.
// Only pairs where our token is the BASE token count; otherwise symbol and price belong to the other token.
export async function findMainPool(token, fetchFn = fetch) {
  let body;
  try {
    const res = await fetchFn(`https://api.dexscreener.com/latest/dex/tokens/${token}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (e) { throw new Error(`DexScreener lookup failed: ${e.message}`); }
  const t = token.toLowerCase();
  const pairs = (body.pairs ?? []).filter((p) => p.chainId === "ethereum" && p.baseToken?.address?.toLowerCase() === t);
  if (!pairs.length) return null;
  const p = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  return {
    chain: "ethereum", pool: p.pairAddress, dex: p.dexId,
    symbol: p.baseToken.symbol, name: p.baseToken.name,
    priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
    liquidityUsd: p.liquidity?.usd ?? null,
  };
}
