# RugReceipt

A pre-listing check for a token, with a receipt for every answer. Give it an Ethereum token address and it buys four
checks from [Telegraph](https://anjoman.ai/docs) (liquidity, holders, price, wash trading; plus sanctions if you give a
team name), cross-checks each paid answer against a free source, and returns **LIST / CAUTION / REJECT** with the reasons,
the cost and a Telegraph receipt per paid row.

Live (testnet): **https://rugreceipt-rho.vercel.app**

Team Tripod (gajanand27-05, Likith2005-coder, Yashash4) · Telegraph Season II hackathon, Apps & Agents track,
missions [#189 Exchange](https://github.com/telegraphprotocol/bounties/issues/189) and
[#202 Web3 & DeFi](https://github.com/telegraphprotocol/bounties/issues/202).
*Disclosure: this is a hackathon entry; the team may win a prize for it.*

> **Season II judges: 2-minute path**
> 1. Open https://rugreceipt-rho.vercel.app and check PEPE: `0x6982508145454Ce325dDbE47a25d4ec3d2311933`.
> 2. Watch the rows arrive; each paid row shows the miner, the cost and a **receipt** link (Telegraph's delivery proof for that call).
> 3. The verdict is at the top, with the reasons. The share link (`/r/<id>`) is the saved report.
> 4. A failure case: check `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` (a router, no pool). It stops before paying: "Nothing was charged."

## Telegraph intents used

Telegraph always picks the miner; RugReceipt never pins one. Every paid answer is compared with a free reference
(within 10% = confirmed); a paid answer that disagrees is shown as "looks wrong" and the reference is used.

| Check | Intent | Sent | Field read | Cross-checked against |
|---|---|---|---|---|
| Pool liquidity | `LIQUIDITY_DEPTH_VERIFY_GENERAL` | params `{pool, chain: "ethereum"}` | `liquidity_usd` | DexScreener pair liquidity |
| Holders | `TOKEN_HOLDER_COUNT_GENERAL` | params `{token, chain: "ethereum"}` | `holders_count` | honeypot.is `token.totalHolders` |
| Price | `CRYPTO_PRICE_USD` | params `{symbol}` | `price_usd` | DexScreener pair price |
| Wash trading (info only) | `WASH_TRADING_DETECTION_GENERAL` | plain-English query naming the pool | `verdict`, `wash_volume_pct` | none (shown, not used for the verdict) |
| Sanctions (with `--name`) | `SANCTIONS_SCREENING_MATCH_GENERAL` | the team/company name as the query | `matched` | US Treasury OFAC SDN list (an OFAC match always means REJECT) |

Free rows, labelled with their source: on-chain total supply (info only) and the honeypot.is sell simulation.
No Telegraph intent covers honeypot/sell-tax detection (bounty #41 was closed as not planned), so that row is not Telegraph intelligence.

## Reproduce in 5 minutes

You need Node.js 20+, git, and about 0.01 Sepolia ETH for gas (any Sepolia faucet). Everything is testnet: the USDC is a
test token anyone can mint. Use a throwaway key only. Commands work in Git Bash, PowerShell 5.1 and PowerShell 7 (one per line).

```bash
git clone https://github.com/gajanand27-05/rugreceipt && cd rugreceipt
npm install
npm test                 # offline, free: 132 tests (engine, payment rail, website)
npm run wallet           # creates a throwaway wallet in .env, prints address + balances; send it ~0.01 Sepolia ETH
npm run mint             # mints 10 test USDC to that wallet
npm run deposit -- 1     # puts 1 test USDC into your Telegraph escrow (2 transactions; max 3)
npm run ask              # one paid CRYPTO_PRICE_USD request: $0.01, prints the answer and the receipt
npm run check -- 0x6982508145454Ce325dDbE47a25d4ec3d2311933    # PEPE: about $0.04, 20-40 s
```

Expected from `npm run check` on PEPE: one line per row as it finishes (value, miner, cost, ✓/⚠/✗), then
`VERDICT: LIST` (or CAUTION if a provider failed), the reasons, the total from receipts, the escrow balance before and
after, and `Saved: evidence/reports/<time>-PEPE.json`.

Failure case (free): `npm run check -- 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` stops with "Stopped before paying: No Ethereum pool …".

Website without paying anything: `RUGRECEIPT_REPLAY=1 npx next dev -H 127.0.0.1` replays a saved PEPE report.
Without `RUGRECEIPT_REPLAY=1` the local site pays from the `.env` wallet's escrow.

### Costs

| What | Cost (test USDC) |
|---|---|
| One paid row | $0.01 (from its receipt) |
| One check | $0.04, or $0.05 with `--name` |
| Free rows (DexScreener, OFAC, on-chain supply, honeypot.is) | $0 |
| A refused check (bad address, no pool, rate limit, low balance) | $0 |
| Live site caps | 10 checks per visitor per hour, 100 per day |

**Payment rail:** requests pay from Telegraph escrow by default (one deposit, then a signed message per request, no
facilitator). Set `TELEGRAPH_PAY=x402` to pay per call with x402 instead (capped at $0.10 per request); x402 settlement
through facilitator.x402.rs has been timing out since 18 Nov 2026. On escrow a failed request is never billed.
Requests to Telegraph are public, so don't put private data in them.

### Known limits

- Testnet only (Ethereum Sepolia, test USDC); mainnet tokens are looked up, payments are testnet.
- Some providers answer wrongly; that is why every paid row is cross-checked. Reported: [#207](https://github.com/telegraphprotocol/bounties/issues/207) (liquidity $28M for a $0 pool), [#208](https://github.com/telegraphprotocol/bounties/issues/208) (sanctions), [#209](https://github.com/telegraphprotocol/bounties/issues/209) (~9.59M holders for every token).
- Holders are only trusted when they match honeypot.is; for pools it does not support (e.g. Uniswap v4) the row is "not cross-checked" and the verdict is at most CAUTION.
- Escrow receipt links (`/v1/blocks/<epoch>/deliveries/<receipt_hash>`) return 404 until Telegraph records that epoch's block (up to about an hour).
- Right after a deposit the node may still refuse a request for "insufficient escrow" for a few minutes (seen 19 Nov); nothing is charged.
- Not checked: owner mint functions, unlocked liquidity, proxy upgrades.

### What the missions measure

- **Cost per decision:** $0.04 (receipts only; $0.05 with a name).
- **Latency:** about 20-40 s per check (the paid rows run in parallel; each has a 45 s limit).
- **False clearance rate on our fixtures:** 0 of 3: the 100%-sell-tax honeypot `0x5599…a1d` → REJECT, Macca → CAUTION, PEPE → LIST.
- **Traceable evidence:** every paid row carries its receipt (and signal hash); every free row names its source.

## Try it and tell us

We want to know how it does on tokens we haven't tried. Run one check (or the free replay site), then
[open an issue with the "Tried it" template](../../issues/new?template=tried-it.md): the token, the verdict, the cost, a
receipt hash, and what broke or looked wrong. Wrong verdicts are the most useful reports.

## More commands

```bash
npm run ask -- '{"query":"Will London get rain in the next 24 hours?"}'           # any routed question, $0.01
npm run check -- <token address> --name "Team or company name"                    # adds the sanctions check, about $0.05
```

Before paying anything `npm run check` checks the token address, `EVM_PRIVATE_KEY`, the balance it pays from, and that
the token has an Ethereum pool. Discover intents and miners for free:
`https://devnode.telegraphprotocol.com/engine/v1/intents` and `https://devnode.telegraphprotocol.com/api/miners?intent=FX_NOW_EUR`.

## License

MIT, see [LICENSE](LICENSE).
