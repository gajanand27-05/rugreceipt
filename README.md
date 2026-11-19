# Telegraph first paid request

Makes a paid Telegraph intelligence request on testnet (Ethereum Sepolia, about $0.01 test USDC) and saves the answer and receipt as evidence.

Requires Node.js 20 or newer.

```bash
npm install
npm run wallet   # creates a throwaway wallet in .env, prints address + balances
# send ~0.01 Sepolia ETH to that address from any Sepolia faucet
npm run mint     # mints 10 test USDC
npm run deposit  # puts 2 test USDC into Telegraph escrow (max 3), which pays the requests
npm run ask      # pays for one CRYPTO_PRICE_USD request, saves evidence/<time>.json
npm run ask -- '{"query":"Will London get rain in the next 24 hours?"}'
```

**Payment rail:** requests pay from Telegraph escrow by default (one deposit, then a signed message per request, no facilitator). Set `TELEGRAPH_PAY=x402` to pay per call with x402 instead (capped at $0.10 per request); x402 settlement through facilitator.x402.rs has been timing out since 18 Nov 2026. Requests are public, so don't put private data in them.

Discover intents and miners (free):
- `https://devnode.telegraphprotocol.com/api/miners?intent=FX_NOW_EUR`
- `https://devnode.telegraphprotocol.com/engine/v1/intents/FX_NOW_EUR/miners`

## RugReceipt check (engine)

Works the same in Git Bash, Windows PowerShell 5.1 and PowerShell 7 (one command per line, no `&&`). Run inside `code/`.

```bash
npm test                                                          # offline tests, no payments
npm run check -- <token address>                                  # about $0.04 test USDC
npm run check -- <token address> --name "Team or company name"    # adds the sanctions check, about $0.05
```

Before paying anything it checks the token address, `EVM_PRIVATE_KEY` and the test-USDC balance (a bad address exits with the usage line and spends nothing). Each run then:

- buys 4 checks through Telegraph in parallel (5 with `--name`), always letting Telegraph pick the miner;
- cross-checks liquidity and price against DexScreener, holders against honeypot.is, and sanctions against the US Treasury OFAC SDN list (an OFAC match always means REJECT);
- shows free rows with their source: on-chain total supply (info only) and the honeypot.is sell simulation;
- prints LIST / CAUTION / REJECT with reasons, the total from receipts only ("cost unknown" when a paid request failed without a receipt), and the wallet balance before and after;
- saves the full report to `evidence/reports/<time>-<SYMBOL>.json`.

Testnet only (Ethereum Sepolia, test USDC). Only the paid rows are Telegraph intelligence; the free sources are there to catch wrong answers. On escrow a failed request is never billed; the escrow balance before and after is shown at the end of each run.
