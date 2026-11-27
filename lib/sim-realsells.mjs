// code/lib/sim-realsells.mjs: did real holders sell recently? (anti-bot check before a FRAUD verdict, task4-miner-plan.md item 6)
// transfers: token Transfer logs into the pool, decoded to { tx, from }.
// swaps: the pool's Swap logs, decoded to { tx, wethOut } (WETH paid out by the pool, bigint).
export function countRealSells(transfers, swaps, pool) {
  const paid = new Set(swaps.filter((s) => s.wethOut > 0n).map((s) => s.tx));
  const p = pool.toLowerCase();
  const sells = new Map(); // tx -> seller
  for (const t of transfers) {
    const from = t.from.toLowerCase();
    if (from !== p && paid.has(t.tx) && !sells.has(t.tx)) sells.set(t.tx, from);
  }
  return { realSells: sells.size, senders: new Set(sells.values()).size };
}
