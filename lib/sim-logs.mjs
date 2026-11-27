// code/lib/sim-logs.mjs: recent real sells on a Uniswap V2-style pair, from logs (anti-bot check, task4-miner-plan.md item 6).
// Walks back ~2,000 blocks in 500-block chunks (free RPCs cap getLogs ranges) and stops once the downgrade
// threshold is met. Returns { realSells, senders }, or null if the logs could not be read.
import { decodeAbiParameters, keccak256, pad, toHex } from "viem";
import { countRealSells } from "./sim-realsells.mjs";

export const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));
export const SWAP_TOPIC = keccak256(toHex("Swap(address,uint256,uint256,uint256,uint256,address)"));
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const CHUNK = 500, CHUNKS = 4;
const enough = (r) => r.realSells >= 3 && r.senders >= 2;

export async function fetchRealSells(token, pool, rpc, block) {
  const wethIs0 = WETH < token.toLowerCase(); // V2 pairs sort token0 < token1
  const transfers = [], swaps = [];
  try {
    for (let i = 0; i < CHUNKS; i++) {
      const toBlock = block - i * CHUNK, fromBlock = toBlock - CHUNK + 1;
      const range = { fromBlock: toHex(fromBlock), toBlock: toHex(toBlock) };
      const tl = await rpc.request("eth_getLogs", [{ ...range, address: token, topics: [TRANSFER_TOPIC, null, pad(pool, { size: 32 })] }]);
      const sl = await rpc.request("eth_getLogs", [{ ...range, address: pool, topics: [SWAP_TOPIC] }]);
      for (const l of tl) transfers.push({ tx: l.transactionHash, from: `0x${l.topics[1].slice(26)}` });
      for (const l of sl) {
        const [, , a0Out, a1Out] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], l.data);
        swaps.push({ tx: l.transactionHash, wethOut: wethIs0 ? a0Out : a1Out });
      }
      if (enough(countRealSells(transfers, swaps, pool))) break;
    }
  } catch {
    return null;
  }
  return countRealSells(transfers, swaps, pool);
}
