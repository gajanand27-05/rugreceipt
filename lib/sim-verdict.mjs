// code/lib/sim-verdict.mjs: honeypot-simulator miner, subject parsing + verdict mapping (task4-miner-plan.md).
// Taxes are fractions (0.25 = 25%). We never answer LEGITIMATE: a clean simulation is not an audit.
const ADDR = /0x[0-9a-fA-F]{40}/g;
const OTHER_CHAIN = /\b(base|bsc|bnb|binance|arbitrum|optimism|polygon|matic|avalanche|avax|solana|tron|fantom|linea|zksync|blast|sepolia)\b/i;
const NOT_COVERED = "Simulated buy and sell only; owner powers, proxies and liquidity locks not checked.";

export function parseSubject(subject) {
  const text = String(subject ?? "");
  const found = [...new Set((text.match(ADDR) ?? []).map((a) => a.toLowerCase()))];
  if (found.length !== 1) return { ok: false, reason: found.length ? "more than one address" : "no Ethereum token address" };
  if (OTHER_CHAIN.test(text)) return { ok: false, reason: "another chain named; this miner only covers Ethereum mainnet" };
  return { ok: true, address: found[0] };
}

const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const answer = (verdict, risk_score, signals, summary) => ({ verdict, risk_score, signals, summary: `${summary} ${NOT_COVERED}` });

// realSells: { realSells, senders } from recent pool logs, or null when that check could not run.
export function simVerdict(sim, realSells = { realSells: 0, senders: 0 }) {
  const taxes = `buy tax ${pct(sim.buyTax)}, sell tax ${pct(sim.sellTax)}, transfer tax ${pct(sim.transferTax)}`;
  const signals = [taxes];
  if (sim.revertReason) signals.push(`reverted: ${sim.revertReason}`);
  if (!sim.buyOk) return answer("SUSPICIOUS", 0.6, signals, "The simulated buy failed (trading closed, blacklist or limit).");

  const severe = !sim.sellOk || sim.sellTax >= 0.5;
  if (severe) {
    if (realSells == null) signals.push("real-sell check unavailable");
    else if (realSells.realSells >= 3 && realSells.senders >= 2) {
      signals.push(`simulation reverted but ${realSells.realSells} real sells succeeded in the last ~2,000 blocks; may be an anti-bot / contract restriction`);
      return answer("SUSPICIOUS", 0.6, signals, "The simulated sell failed or was heavily taxed, but real holders sold recently.");
    }
    return sim.sellOk
      ? answer("LIKELY_FRAUD", 0.85, signals, `Selling loses ${pct(sim.sellTax)} of the value.`)
      : answer("FRAUD", 0.95, signals, "Honeypot: the token can be bought but the simulated sell reverts.");
  }
  if (sim.sellTax >= 0.1 || sim.buyTax >= 0.1 || sim.transferTax >= 0.1)
    return answer("SUSPICIOUS", 0.6, signals, `High tax or blocked transfer (${taxes}).`);
  return answer("LOW", 0.15, signals, `Buy, transfer and sell all succeeded in simulation (${taxes}).`);
}
