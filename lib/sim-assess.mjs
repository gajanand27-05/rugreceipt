// code/lib/sim-assess.mjs: the honeypot-simulator miner's answer to one FRAUD_DETECTION_GENERAL subject.
// Answer = the intent's five fields: subject, verdict, risk_score, signals, summary (task4-miner-plan.md).
// An RPC outage is thrown (code rpc_unavailable) so the route can answer 503 and the caller is not billed.
import { encodeFunctionData, parseAbi } from "viem";
import { parseSubject, simVerdict } from "./sim-verdict.mjs";

const SCOPE = "Ethereum ERC-20 token addresses only.";
const erc20 = parseAbi(["function totalSupply() view returns (uint256)"]);
const inconclusive = (subject, why, signals = []) =>
  ({ subject, verdict: "INCONCLUSIVE", risk_score: 0.5, signals, summary: `${why} ${SCOPE} This miner simulates buying and selling an Ethereum token.` });

export async function assess(subject, { rpc, simulate, realSells }) {
  const s = parseSubject(subject);
  if (!s.ok) return inconclusive(subject, `Not assessed: ${s.reason}.`);

  // "0x" = no code; 0xef0100 + 20 bytes = an EIP-7702 delegation, i.e. still a wallet.
  const code = await rpc.request("eth_getCode", [s.address, "latest"]);
  if (code === "0x" || /^0xef0100[0-9a-f]{40}$/i.test(code))
    return inconclusive(subject, "Not a contract (a wallet or an empty address).");
  try {
    await rpc.request("eth_call", [{ to: s.address, data: encodeFunctionData({ abi: erc20, functionName: "totalSupply" }) }, "latest"]);
  } catch (e) {
    if (e.code === "reverted") return inconclusive(subject, "A contract, but not an ERC-20 token (totalSupply() reverts).");
    throw e;
  }

  const sim = await simulate(s.address, rpc);
  if (sim.noPool)
    return inconclusive(subject, "No Uniswap V2-style WETH pool found: pool type not simulated (Uniswap V3/V4 or other DEX).");

  const severe = !sim.buyOk ? false : !sim.sellOk || sim.sellTax >= 0.5;
  const sells = severe ? await realSells(s.address, sim.pool, sim.block) : { realSells: 0, senders: 0 };
  const v = simVerdict(sim, sells);
  const signals = [...v.signals, `pool: ${sim.dex} ${sim.pool}`, `block: ${sim.block}`];
  if (severe && sells) signals.push(`real sells in the last ~2,000 blocks: ${sells.realSells}`);
  return { subject, verdict: v.verdict, risk_score: v.risk_score, signals, summary: v.summary };
}
