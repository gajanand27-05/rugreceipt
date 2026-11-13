# Telegraph first paid request

Makes a paid Telegraph intelligence request on testnet (Ethereum Sepolia, x402, about $0.01 test USDC) and saves the answer and receipt as evidence.

Requires Node.js 20 or newer.

```bash
npm install
npm run wallet   # creates a throwaway wallet in .env, prints address + balances
# send ~0.01 Sepolia ETH to that address from any Sepolia faucet
npm run mint     # mints 10 test USDC
npm run ask      # pays for one CRYPTO_PRICE_USD request, saves evidence/<time>.json
npm run ask -- '{"query":"Will London get rain in the next 24 hours?"}'
```

Each request is capped at $0.10 (`maxAmountPerPayment` in `ask.mjs`). Requests are public, so don't put private data in them.

Discover intents and miners (free):
- `https://devnode.telegraphprotocol.com/api/miners?intent=FX_NOW_EUR`
- `https://devnode.telegraphprotocol.com/engine/v1/intents/FX_NOW_EUR/miners`
