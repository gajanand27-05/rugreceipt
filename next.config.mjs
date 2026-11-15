// Keep the x402 payment libraries as plain Node packages on the server (not bundled).
export default {
  serverExternalPackages: ["@x402/fetch", "@x402/evm"],
};
