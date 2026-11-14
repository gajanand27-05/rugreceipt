// code/lib/config.mjs: every tunable number in one place.
export const CONFIG = {
  node: "https://devnode.telegraphprotocol.com",
  network: "eip155:11155111",
  usdc: "0xcc194e1a843B658526D0D5C431f670028582Ae17",
  maxPerPaymentUusdc: "100000",          // $0.10 cap per paid request
  checkTimeoutMs: 45_000,
  tolerance: 0.10,                       // cross-check: within 10% = confirmed
  minLiquidityUsd: 50_000,
  minHolders: 500,
  rpc: "https://ethereum-rpc.publicnode.com",
  // From Task 1 (phase0-results.md, 14 Nov). No paid supply check: that intent is broken.
  REQUEST_MODE: { wash: "query", liquidity: "params", holders: "params", price: "params", sanctions: "query" },
};
