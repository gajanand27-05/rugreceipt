// Creates a throwaway testnet wallet in .env (once), then prints its address and balances.
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatEther, formatUnits, erc20Abi } from "viem";
import { sepolia } from "viem/chains";

const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const RPC = "https://ethereum-sepolia-rpc.publicnode.com";

let key = existsSync(".env") && readFileSync(".env", "utf8").match(/^EVM_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/m)?.[1];
if (!key) {
  key = generatePrivateKey();
  appendFileSync(".env", `EVM_PRIVATE_KEY=${key}\n`);
  console.log("Created a new TESTNET-ONLY wallet in .env (never put real funds in it).");
}

const { address } = privateKeyToAccount(key);
const client = createPublicClient({ chain: sepolia, transport: http(RPC) });
const [eth, usdc] = await Promise.all([
  client.getBalance({ address }),
  client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
]);

console.log("Address:     ", address);
console.log("Sepolia ETH: ", formatEther(eth));
console.log("Test USDC:   ", formatUnits(usdc, 6));
if (eth === 0n) console.log("\nNext: send ~0.01 Sepolia ETH to this address from a faucet, then run `npm run mint`.");
