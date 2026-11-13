// one-off survey: node --env-file=.env survey.mjs "INTENT|query"
import { writeFileSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
const N="eip155:11155111", [intent, query] = process.argv[2].split("|");
const f = wrapFetchWithPaymentFromConfig(fetch, { schemes:[{network:N, client:new ExactEvmScheme(privateKeyToAccount(process.env.EVM_PRIVATE_KEY))}],
  spendControls:{allowedAssets:[{network:N, asset:"0xcc194e1a843B658526D0D5C431f670028582Ae17", maxAmountPerPayment:"100000"}]}});
const t=Date.now();
const r = await f("https://devnode.telegraphprotocol.com/engine/v1/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({intent,query})});
const a = await r.json().catch(()=>null);
writeFileSync(`evidence/${process.env.OUT||"survey"}/${intent}.json`, JSON.stringify({intent,query,status:r.status,answer:a},null,2));
console.log(`### ${intent} | HTTP ${r.status} | ${Date.now()-t}ms | miner: ${a?.miner_name}\n${JSON.stringify(a?.result ?? a).slice(0,450)}\n`);
