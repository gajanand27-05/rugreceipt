// code/check.mjs: RugReceipt from the terminal (testnet).
// Usage: npm run check -- <token address> [--name "Team or company name"]
import { mkdirSync, writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { CONFIG } from "./lib/config.mjs";
import { expectedCostUusdc, makeBalanceReader } from "./lib/balances.mjs";
import { runTokenCheck } from "./lib/engine.mjs";
import { makePayingFetch } from "./lib/telegraph.mjs";
import { USAGE, parseArgs, keyProblem, safeSymbol, showValue, markFor, costText, totalLine, usd } from "./lib/cli.mjs";

const fail = (msg) => { console.error(msg); process.exit(1); };

// 1. Everything that can be checked offline, before any network call or payment.
const args = parseArgs(process.argv.slice(2));
if (args.error) fail(`${args.error}\n${USAGE}`);
const problem = keyProblem(process.env.EVM_PRIVATE_KEY);
if (problem) fail(problem);
const { address } = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);

// 2. Wallet before: test USDC, plus escrow (where a failed paid request's payment is credited).
const balances = makeBalanceReader(address);
const before = await balances().catch(() => null);
const expected = expectedCostUusdc(args.name);
if (!before) console.log("Warning: could not read the wallet balance (Sepolia RPC); continuing without before/after.");
else {
  if (before.usdc < expected) fail(`Not enough test USDC: ${usd(before.usdc)}, this run needs about ${usd(expected)}. Run \`npm run mint\`.`);
  if (before.usdc < CONFIG.lowBalanceUusdc) console.log(`Warning: test USDC is low (${usd(before.usdc)}). Run \`npm run mint\` soon.`);
}

// 3. The check. Rows print as they finish.
console.log(`RugReceipt (TESTNET: Ethereum Sepolia, test USDC): checking ${args.token}${args.name ? ` with name "${args.name}"` : ""} ...`);
console.log(`Expected cost about ${usd(expected)}.\n`);
const fit = (t, w) => (t.length > w ? t.slice(0, w - 1) + "…" : t).padEnd(w);   // full value is in the saved report
const line = (r) => console.log(`  ${r.label.padEnd(24)} ${fit(showValue(r), 36)} ${(r.miner ?? "-").slice(0, 26).padEnd(27)} ${costText(r).padEnd(13)} ${markFor(r)}`);
let report;
try {
  report = await runTokenCheck({ token: args.token, name: args.name }, { payFetch: makePayingFetch(process.env.EVM_PRIVATE_KEY) }, line);
} catch (e) {
  fail(`\nStopped before paying: ${e.message}`);
}

console.log(`\nVERDICT: ${report.verdict}${report.note ? ` (${report.note})` : ""}`);
for (const reason of report.reasons) console.log(`  · ${reason}`);
if (report.wrongCount) console.log(`Data quality: ${report.wrongCount} paid answer(s) looked wrong; the free reference was used instead.`);
console.log(totalLine(report));

// 4. Wallet after. Settlement can lag a block, so wait up to ~20 s for the drop the receipts predict.
let after = null;
if (before) {
  for (let i = 0; i < 5; i++) {
    after = (await balances().catch(() => null)) ?? after;   // keep the last good reading
    if (after && before.usdc - after.usdc >= report.totalCostUusdc) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (after) {
    const spent = before.usdc - after.usdc;
    const diff = spent - report.totalCostUusdc;
    const why = diff === 0 ? ", match"
      : diff > 0 && report.costUnknownCount ? `: ${usd(diff)} more, paid for failed requests; Telegraph credits it to escrow`
      : ", DIFFERENT: check the receipts";
    console.log(`Wallet: ${usd(before.usdc)} → ${usd(after.usdc)} test USDC (spent ${usd(spent)}; receipts say ${usd(report.totalCostUusdc)}${why})`);
    // Checks run in parallel: the wallet shows THAT a failed call was charged, not which one, unless only one failed.
    const unknown = report.rows.filter((r) => r.source === "telegraph" && r.state !== "skipped" && r.costUusdc == null);
    if (diff > 0 && unknown.length === 1)
      console.log(`  → ${unknown[0].label} was charged ${usd(diff)} with no receipt; Telegraph credits it to escrow.`);
    if (before.escrow != null && after.escrow != null)
      console.log(`Escrow credit: ${usd(before.escrow)} → ${usd(after.escrow)} (every x402 payment sits here until the epoch closes; what stays after that is failed requests)`);
  } else console.log("Wallet: could not read the balance after the run.");
}

const wallet = { address, usdcBefore: before?.usdc ?? null, usdcAfter: after?.usdc ?? null, escrowBefore: before?.escrow ?? null, escrowAfter: after?.escrow ?? null };
mkdirSync("evidence/reports", { recursive: true });
const file = `evidence/reports/${report.checkedAt.replace(/[:.]/g, "-")}-${safeSymbol(report.pool.symbol)}.json`;
writeFileSync(file, JSON.stringify({ ...report, wallet }, null, 2));
console.log(`Saved: ${file}`);
