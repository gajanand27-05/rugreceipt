// code/check.mjs: RugReceipt from the terminal (testnet).
// Usage: npm run check -- <token address> [--name "Team or company name"]
// Pays from Telegraph escrow by default; TELEGRAPH_PAY=x402 pays per call from the wallet instead.
import { mkdirSync, writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { CONFIG } from "./lib/config.mjs";
import { expectedCostUusdc, makeBalanceReader } from "./lib/balances.mjs";
import { runTokenCheck } from "./lib/engine.mjs";
import { makePayingFetch, railFromEnv } from "./lib/telegraph.mjs";
import { USAGE, parseArgs, keyProblem, safeSymbol, showValue, markFor, costText, totalLine, usd } from "./lib/cli.mjs";

const fail = (msg) => { console.error(msg); process.exit(1); };

// 1. Everything that can be checked offline, before any network call or payment.
const args = parseArgs(process.argv.slice(2));
if (args.error) fail(`${args.error}\n${USAGE}`);
const problem = keyProblem(process.env.EVM_PRIVATE_KEY);
if (problem) fail(problem);
const { address } = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
let rail;
try { rail = railFromEnv(); } catch (e) { fail(e.message); }
// What a run spends from: the escrow deposit on the Telegraph contract, or the wallet's test USDC (x402).
const fund = rail === "escrow" ? "escrow" : "usdc";
const fundName = rail === "escrow" ? "Telegraph escrow" : "wallet test USDC";
const topUp = rail === "escrow" ? "Deposit more with depositUSDC on the Telegraph contract (see README)." : "Run `npm run mint`.";

// 2. Balance before (wallet test USDC and escrow `available`); the run spends from one of them.
const balances = makeBalanceReader(address);
let before = await balances().catch(() => null);
if (before?.[fund] == null) before = null;
const expected = expectedCostUusdc(args.name);
if (!before) console.log(`Warning: could not read the ${fundName} balance; continuing without before/after.`);
else {
  if (before[fund] < expected) fail(`Not enough ${fundName}: ${usd(before[fund])}, this run needs about ${usd(expected)}. ${topUp}`);
  if (before[fund] < CONFIG.lowBalanceUusdc) console.log(`Warning: ${fundName} is low (${usd(before[fund])}). ${topUp}`);
}

// 3. The check. Rows print as they finish.
console.log(`RugReceipt (TESTNET: Ethereum Sepolia, test USDC, paid from ${fundName}): checking ${args.token}${args.name ? ` with name "${args.name}"` : ""} ...`);
console.log(`Expected cost about ${usd(expected)}.\n`);
const fit = (t, w) => (t.length > w ? t.slice(0, w - 1) + "…" : t).padEnd(w);   // full value is in the saved report
const line = (r) => console.log(`  ${r.label.padEnd(24)} ${fit(showValue(r), 36)} ${(r.miner ?? "-").slice(0, 26).padEnd(27)} ${costText(r).padEnd(13)} ${markFor(r)}`);
let report;
try {
  report = await runTokenCheck({ token: args.token, name: args.name }, { payFetch: makePayingFetch(process.env.EVM_PRIVATE_KEY, rail) }, line);
} catch (e) {
  fail(`\nStopped before paying: ${e.message}`);
}

console.log(`\nVERDICT: ${report.verdict}${report.note ? ` (${report.note})` : ""}`);
for (const reason of report.reasons) console.log(`  · ${reason}`);
if (report.wrongCount) console.log(`Data quality: ${report.wrongCount} paid answer(s) looked wrong; the free reference was used instead.`);
console.log(totalLine(report));

// 4. Balance after. x402 settlement and the escrow ledger can lag, so wait up to ~20 s for the drop the receipts predict.
let after = null;
if (before) {
  for (let i = 0; i < 5; i++) {
    const read = await balances().catch(() => null);
    if (read?.[fund] != null) after = read;   // keep the last good reading
    if (after && before[fund] - after[fund] >= report.totalCostUusdc) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (after) {
    const spent = before[fund] - after[fund];
    const diff = spent - report.totalCostUusdc;
    const why = diff === 0 ? ", match"
      : diff > 0 && report.costUnknownCount ? `: ${usd(diff)} more, billed for requests that returned no receipt`
      : ", DIFFERENT: check the receipts";
    console.log(`${fundName}: ${usd(before[fund])} → ${usd(after[fund])} (spent ${usd(spent)}; receipts say ${usd(report.totalCostUusdc)}${why})`);
    // Checks run in parallel: the balance shows THAT a no-receipt call was billed, not which one, unless only one had no receipt.
    const unknown = report.rows.filter((r) => r.source === "telegraph" && r.state !== "skipped" && r.costUusdc == null);
    if (diff > 0 && unknown.length === 1)
      console.log(`  → ${unknown[0].label} was billed ${usd(diff)} with no receipt.`);
  } else console.log(`${fundName}: could not read the balance after the run.`);
}

const wallet = { address, rail, usdcBefore: before?.usdc ?? null, usdcAfter: after?.usdc ?? null, escrowBefore: before?.escrow ?? null, escrowAfter: after?.escrow ?? null };
mkdirSync("evidence/reports", { recursive: true });
const file = `evidence/reports/${report.checkedAt.replace(/[:.]/g, "-")}-${safeSymbol(report.pool.symbol)}.json`;
writeFileSync(file, JSON.stringify({ ...report, wallet }, null, 2));
console.log(`Saved: ${file}`);
