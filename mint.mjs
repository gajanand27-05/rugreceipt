// Mints 10 test USDC to the .env wallet (needs a little Sepolia ETH for gas).
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";

const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const transport = http("https://ethereum-sepolia-rpc.publicnode.com");
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);

const wallet = createWalletClient({ account, chain: sepolia, transport });
const hash = await wallet.writeContract({
  address: USDC,
  abi: parseAbi(["function mint(address,uint256)"]),
  functionName: "mint",
  args: [account.address, 10_000_000n], // 10 USDC (6 decimals)
});
console.log("Mint tx:", `https://sepolia.etherscan.io/tx/${hash}`);
const receipt = await createPublicClient({ chain: sepolia, transport }).waitForTransactionReceipt({ hash });
console.log("Status:", receipt.status);
