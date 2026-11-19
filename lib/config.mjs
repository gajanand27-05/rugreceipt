// code/lib/config.mjs: every tunable number in one place.
export const CONFIG = {
  node: "https://devnode.telegraphprotocol.com",
  network: "eip155:11155111",
  usdc: "0xcc194e1a843B658526D0D5C431f670028582Ae17",
  maxPerPaymentUusdc: "100000",          // $0.10 cap per paid request (x402 rail)
  payRail: "escrow",                     // default for TELEGRAPH_PAY: x402's facilitator times out since 18 Nov
  escrowMarginUusdc: 50_000,             // website refuses below one check + $0.05: the ledger may lag this epoch's charges
  checkTimeoutMs: 45_000,
  freeTimeoutMs: 15_000,                 // each free source (DexScreener, OFAC, RPC, honeypot.is)
  maxSellTaxPct: 10,                     // honeypot.is sell tax above this (but sellable) → CAUTION
  tolerance: 0.10,                       // cross-check: within 10% = confirmed
  minLiquidityUsd: 50_000,
  minHolders: 500,
  rpc: "https://ethereum-rpc.publicnode.com",
  sepoliaRpc: "https://ethereum-sepolia-rpc.publicnode.com",
  diamond: "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",  // Telegraph contract (new 17 Nov; 0x3624… retired): escrow deposits
  lowBalanceUusdc: 500_000,              // warn under $0.50 test USDC
  // Website (Part 2): per-visitor and whole-site caps protect the demo wallet.
  web: { perIpPerHour: 10, perDay: 100, maxNameLength: 100 },   // 100/day ≈ $4-5 test USDC: below the wallet balance
  // From Task 1 (phase0-results.md, 14 Nov). No paid supply check: that intent is broken.
  REQUEST_MODE: { wash: "query", liquidity: "params", holders: "params", price: "params", sanctions: "query" },
};
