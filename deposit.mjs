// Deposits test USDC from the .env wallet into its Telegraph escrow (approve + depositUSDC on the Diamond),
// then prints the node's ledger for the wallet. Escrow pays requests with a signed message: no facilitator.
// Usage: npm run deposit -- <USDC amount, default 2, max 3>
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http, parseAbi, erc20Abi, parseUnits } from "viem";
import { sepolia } from "viem/chains";
import { CONFIG } from "./lib/config.mjs";

const amountUsdc = Number(process.argv[2] ?? 2);
if (!(amountUsdc > 0 && amountUsdc <= 3)) { console.error("Amount must be more than 0 and at most 3 test USDC."); process.exit(1); }
const amount = parseUnits(String(amountUsdc), 6);

const transport = http(CONFIG.sepoliaRpc);
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const wallet = createWalletClient({ account, chain: sepolia, transport });
const client = createPublicClient({ chain: sepolia, transport });

async function send(label, request) {
  const hash = await wallet.writeContract(request);
  console.log(`${label} tx: https://sepolia.etherscan.io/tx/${hash}`);
  const { status } = await client.waitForTransactionReceipt({ hash });
  if (status !== "success") { console.error(`${label} failed (${status}). Stopping.`); process.exit(1); }
}

console.log(`Depositing ${amountUsdc} test USDC from ${account.address} into escrow on ${CONFIG.diamond} ...`);
await send("Approve", { address: CONFIG.usdc, abi: erc20Abi, functionName: "approve", args: [CONFIG.diamond, amount] });
await send("Deposit", { address: CONFIG.diamond, abi: parseAbi(["function depositUSDC(uint256)"]), functionName: "depositUSDC", args: [amount] });

const ledger = await fetch(`${CONFIG.node}/v1/ledger/account/${account.address.toLowerCase()}`).then((r) => r.json()).catch(() => null);
console.log("Ledger:", ledger ? { deposited: ledger.deposited, balance: ledger.balance, available: ledger.available } : "could not read (the node may need a minute)");
