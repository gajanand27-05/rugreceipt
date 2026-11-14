// code/phase0.mjs: for each token and check, buy once with structured params and once with
// plain English, and print both answers next to the free reference.
// Usage: node --env-file=.env phase0.mjs > ../phase0-raw.txt   (full answers go to ../phase0-raw.json)
import { writeFileSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const N = "eip155:11155111";
const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: N, client: new ExactEvmScheme(privateKeyToAccount(process.env.EVM_PRIVATE_KEY)) }],
  spendControls: { allowedAssets: [{ network: N, asset: "0xcc194e1a843B658526D0D5C431f670028582Ae17", maxAmountPerPayment: "100000" }] },
});

// Person C may swap these. Keep at least one big token and one brand-new small token.
const TOKENS = [
  "0x6982508145454Ce325dDbE47a25d4ec3d2311933", // PEPE (big)
  "0x514910771AF9Ca656af840dff83E8264EcF986CA", // LINK (big)
  "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", // UNI (big)
  "0x0A675e411F95db85Fa23e2bCfAb65ecA91a6aD9a", // MACCA (tiny, launched 13 Nov)
];

const INTENT = { wash: "WASH_TRADING_DETECTION_GENERAL", liquidity: "LIQUIDITY_DEPTH_VERIFY_GENERAL",
  holders: "TOKEN_HOLDER_COUNT_GENERAL", supply: "TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL",
  price: "CRYPTO_PRICE_USD", sanctions: "SANCTIONS_SCREENING_MATCH_GENERAL" };

const raw = [];

async function ask(token, id, mode, body) {
  const t = Date.now();
  try {
    const r = await pay("https://devnode.telegraphprotocol.com/engine/v1/ask", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const a = await r.json().catch(() => null);
    raw.push({ token, id, mode, body, status: r.status, ms: Date.now() - t, answer: a });
    return `${r.status} ${Date.now() - t}ms ${a?.miner_name ?? "-"} ${JSON.stringify(a?.result ?? a).slice(0, 160)}`;
  } catch (e) {
    raw.push({ token, id, mode, body, ms: Date.now() - t, error: e.message });
    return `ERROR ${e.message}`;
  }
}

for (const token of TOKENS) {
  const p = (await (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`)).json()).pairs
    ?.filter((x) => x.chainId === "ethereum").sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  if (!p) { console.log(`\n##### ${token}: no Ethereum pool on DexScreener, skipped`); continue; }
  const sym = p.baseToken.symbol, pool = p.pairAddress;
  console.log(`\n##### ${sym} ${token}\nREFERENCE price=${p.priceUsd} liquidity=${p.liquidity?.usd} pool=${pool}`);
  const cases = {
    wash:      [{ subject: pool },                   `Check wash trading on the ${p.dexId} ${sym} pool ${pool} (token ${token}) on Ethereum`],
    liquidity: [{ pool, chain: "ethereum" },         `Liquidity depth of the ${p.dexId} ${sym} pool ${pool} (token ${token}) on Ethereum`],
    holders:   [{ token, chain: "ethereum" },        `How many holders does token ${token} on Ethereum have?`],
    supply:    [{ token },                           `Total supply of ERC-20 token ${token} on Ethereum mainnet`],
    price:     [{ symbol: sym },                     `Price in USD of token ${sym} (contract ${token} on Ethereum)`],
    sanctions: [{ name: "Rosneft Oil Company" },     `Rosneft Oil Company`],
  };
  await Promise.all(Object.entries(cases).map(async ([id, [params, query]]) => {
    if (id === "sanctions" && token !== TOKENS[0]) return; // sanctions does not depend on the token
    const [a, b] = await Promise.all([
      ask(token, id, "params", { intent: INTENT[id], params }),
      ask(token, id, "query", { intent: INTENT[id], query }),
    ]);
    console.log(`${id}\n  params: ${a}\n  query : ${b}`);
  }));
}

writeFileSync("../phase0-raw.json", JSON.stringify(raw, null, 2));
