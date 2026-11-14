// code/lib/onchain.mjs: free on-chain read of an ERC-20's total supply (whole tokens).
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { CONFIG } from "./config.mjs";

export const mainnetClient = () => createPublicClient({ chain: mainnet, transport: http(CONFIG.rpc) });

export async function readTotalSupply(token, client = mainnetClient()) {
  try {
    const [raw, decimals] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return Number(formatUnits(raw, decimals));
  } catch { return null; }
}
