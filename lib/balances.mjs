// code/lib/balances.mjs: test-USDC wallet balance + Telegraph escrow balance (Sepolia). Used by the CLI and the website.
// Escrow comes from the node's ledger (`available` = deposits + credits − charges − not-yet-charged usage), not the chain:
// the chain only knows deposits and withdrawals.
import { createPublicClient, http, erc20Abi } from "viem";
import { sepolia } from "viem/chains";
import { CONFIG } from "./config.mjs";

// 3 paid checks (liquidity, holders, price), +1 for a name (sanctions), +1 for the opt-in wash check.
export const expectedCostUusdc = (name, wash = false) => (3 + (name ? 1 : 0) + (wash ? 1 : 0)) * 10_000;

async function readEscrow(address, fetchImpl) {
  const res = await fetchImpl(`${CONFIG.node}/v1/ledger/account/${address.toLowerCase()}`);
  if (!res.ok) throw new Error(`ledger HTTP ${res.status}`);
  return Number((await res.json()).available);
}

export function makeBalanceReader(address, client = createPublicClient({ chain: sepolia, transport: http(CONFIG.sepoliaRpc) }), fetchImpl = fetch) {
  return async () => {
    const [usdc, escrow] = await Promise.all([
      client.readContract({ address: CONFIG.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      readEscrow(address, fetchImpl).catch(() => null),
    ]);
    return { usdc: Number(usdc), escrow: Number.isFinite(escrow) ? escrow : null };
  };
}
