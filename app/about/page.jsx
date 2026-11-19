export const metadata = { title: "How RugReceipt works" };

export default function About() {
  return (
    <article>
      <h1>How RugReceipt works</h1>
      <h2>What happens when you press Check</h2>
      <ol>
        <li>We look up the token's main trading pool on DexScreener (free). If there is none, we stop: nothing is charged.</li>
        <li>Our agent buys 4 checks from Telegraph in parallel (5 if you give a team name): pool liquidity, holders, price,
          wash trading, and sanctions. It pays $0.01 test USDC each over x402. Telegraph picks the best-ranked provider for each
          question; we never choose a provider ourselves.</li>
        <li>At the same time we read free sources: the token's total supply on-chain, a honeypot.is sell simulation, and the US
          Treasury OFAC sanctions list.</li>
        <li>Every paid answer that has a free reference is cross-checked (within 10%). If a paid answer looks wrong, we show both
          numbers, use the reference, and the wrong answer does not affect the verdict.</li>
        <li>Simple, visible rules give the verdict. Every rule that fired is listed on the report.</li>
      </ol>
      <h2>Verdict rules</h2>
      <ul>
        <li><b>REJECT</b>: the name matches the OFAC sanctions list, or honeypot.is could not sell the token (honeypot).</li>
        <li><b>CAUTION</b>: liquidity under $50,000, fewer than 500 holders, holders that could not be cross-checked, sell tax over 10%, a provider reported plain wash
          trading, a possible (one-word) sanctions match, a sanctions match reported by the provider but not found on the OFAC SDN list, or any verdict check got no answer.</li>
        <li><b>LIST</b>: every check that ran answered and none of the above fired. Without a name it says "sanctions not checked".</li>
        <li>Wash trading and total supply are shown as information only.</li>
      </ul>
      <h2>Row states</h2>
      <ul>
        <li><b>✓ confirmed</b>: the paid answer agrees with a free reference.</li>
        <li><b>⚠ looks wrong, reference used</b>: we paid for it, it disagreed, we caught it.</li>
        <li><b>not cross-checked</b>: answered, but there is no free reference for it.</li>
        <li><b>✗ no answer</b>: the provider failed or timed out (45 s). Never shown as a made-up value.</li>
      </ul>
      <h2>Costs and receipts</h2>
      <p>Every paid row links to its receipt. The demo pays from a Telegraph escrow deposit, so each receipt is proven in that
        epoch's ledger block (the link works once the block is recorded, up to about an hour); the older per-call x402 rail
        linked a settlement on Sepolia Etherscan. The total on the report comes only from receipts. On escrow a failed request
        is never billed. "Cost unknown" means the request timed out, so we cannot tell whether it was served and billed.
        A request that returns an answer saying "insufficient data" is still billed. We never retry a paid check automatically,
        because we cannot tell whether a failed attempt was charged.</p>
      <h2>What we don't check</h2>
      <ul>
        <li>Owner mint functions, unlocked liquidity, proxy upgrades. honeypot.is covers sell blocks and taxes, but only for pools it supports.</li>
        <li>Price is looked up by symbol, which scam tokens copy, so small-token prices usually fall back to the DexScreener market price.</li>
        <li>Sanctions uses the OFAC SDN main list only (no aliases, no EU/UN lists in our own check). A one-word name is only a "possible match".</li>
        <li>Only Ethereum mainnet tokens, and only tokens that are the main (base) token of a pool.</li>
        <li>Holder counts: since 15 Nov the provider Telegraph routes this question to answers about 9.59 million holders for every
          token we tried (a 60-holder token included). We only trust a holder count that matches honeypot.is; otherwise the report
          says CAUTION ("holders not cross-checked").</li>
      </ul>
      <h2>Testnet</h2>
      <p>Everything runs on Telegraph's testnet (Ethereum Sepolia, test USDC). The token data is about real mainnet tokens; the payments
        are test money. Each visitor can run 10 checks per hour. This is not financial advice.</p>
      <p>Source code and a one-command local run: <a href="https://github.com/gajanand27-05/rugreceipt">github.com/gajanand27-05/rugreceipt</a>.</p>
    </article>
  );
}
