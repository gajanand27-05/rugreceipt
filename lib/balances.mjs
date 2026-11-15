// code/lib/balances.mjs: test-USDC wallet balance + Telegraph escrow credit (Sepolia). Used by the CLI and the website.
import { createPublicClient, http, erc20Abi, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { CONFIG } from "./config.mjs";

export const expectedCostUusdc = (name) => (name ? 5 : 4) * 10_000;

const escrowAbi = parseAbi(["function effectiveBalance(address) view returns (uint256)"]);

export function makeBalanceReader(address, client = createPublicClient({ chain: sepolia, transport: http(CONFIG.sepoliaRpc) })) {
  return async () => {
    const [usdc, escrow] = await Promise.all([
      client.readContract({ address: CONFIG.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
      client.readContract({ address: CONFIG.diamond, abi: escrowAbi, functionName: "effectiveBalance", args: [address] }).catch(() => null),
    ]);
    return { usdc: Number(usdc), escrow: escrow == null ? null : Number(escrow) };
  };
}
