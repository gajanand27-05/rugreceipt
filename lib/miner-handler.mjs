// code/lib/miner-handler.mjs: POST /api/miner/fraud, the RugReceipt honeypot-simulator miner (FRAUD_DETECTION_GENERAL).
// Free inputs only (public Ethereum RPCs): no wallet key, no paid calls. Errors are real HTTP errors, so the
// node does not bill the caller for a non-answer.
export async function handleMiner(body, { assess }) {
  try {
    return { status: 200, body: await assess(String(body?.subject ?? "")) };
  } catch (e) {
    if (e.code === "rpc_unavailable") return { status: 503, body: { error: "Ethereum RPCs unavailable; try again later." } };
    return { status: 500, body: { error: `Simulation failed: ${e.message}` } };
  }
}
