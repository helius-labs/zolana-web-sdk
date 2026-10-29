/** v0.6.0-alpha deployment pins from the reviewed zolana-infra release manifests. */
export const ZOLANA_PROTOCOL_VERSION = "0.6.0-alpha";

export const ZOLANA_PROGRAM_IDS = Object.freeze({
  shieldedPool: "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW",
  userRegistry: "regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ",
});

function deployment(
  solanaRpcUrl: string,
  indexerUrl: string,
  proverUrl: string,
  measurement: Readonly<{ pcr0: string; pcr1: string; pcr2: string }>,
) {
  return Object.freeze({
    solanaRpcUrl,
    indexerUrl,
    proverUrl,
    proverTee: Object.freeze({
      platform: "aws-nitro" as const,
      measurements: Object.freeze([Object.freeze(measurement)]),
      gpu: "optional" as const,
      maxAgeSecs: 600,
    }),
  });
}

/** Override solanaRpcUrl with your application's RPC on the selected network. */
export const ZOLANA_DEPLOYMENTS = Object.freeze({
  devnet: deployment(
    "https://api.devnet.solana.com",
    "https://d34xe1hqb2ibg2.cloudfront.net",
    "https://dd73hh473h6ha.cloudfront.net",
    {
      pcr0: "30a5ca7cdaa68adc9802c57c7ef590cc4ea3cee981898de55c2aa2082d7980a7ca42c3daf6a0988aff5e6daaacd949ad",
      pcr1: "4b4d5b3661b3efc12920900c80e126e4ce783c522de6c02a2a5bf7af3a2b9327b86776f188e4be1c1c404a129dbda493",
      pcr2: "f389a946e669e3bef011d91189a542619a4dc9fe8578f9af66bc54f8f9347e1cf979a50a8c1f56e7a595bd935bf29cab",
    },
  ),
  mainnet: deployment(
    "https://api.mainnet-beta.solana.com",
    "https://dgcj4pjarvo65.cloudfront.net",
    "https://d3ky2kt0ntqxt1.cloudfront.net",
    {
      pcr0: "89cde9fcf78ed0fe2e80c25554ad38b4022a3372e5f8bf4b1ab6b4b69e721699a5d022d7370bbc8854c2c4f46d630097",
      pcr1: "4b4d5b3661b3efc12920900c80e126e4ce783c522de6c02a2a5bf7af3a2b9327b86776f188e4be1c1c404a129dbda493",
      pcr2: "8265ae7a12c74695e4484aa5f085f730df8c5a4741fb2a334ef88f306f47d39ae0137a9bec2e8a495ce7c6db3841e1ee",
    },
  ),
});

export type ZolanaNetwork = keyof typeof ZOLANA_DEPLOYMENTS;
