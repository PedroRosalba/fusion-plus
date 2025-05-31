const {
  getRandomBytes32,
  SDK,
  HashLock,
  PrivateKeyProviderConnector,
  NetworkEnum,
} = require("@1inch/cross-chain-sdk");
const { Web3 } = require("web3");
require("dotenv").config();

async function get_quote(params) {
  try {
    const quote = await sdk.getQuote(params);
    console.log("Quote fetched successfully:", quote);
    return quote;
  } catch (error) {
    console.error("Error fetching quote:", error);
  }
}

const makerPrivateKey = process.env.PRIVATE_KEY;
const makerAddress = process.env.ADDRESS;
const nodeUrl = "https://eth-mainnet.g.alchemy.com/v2/demo";
const web3Instance = new Web3(nodeUrl);

const blockchainProvider = new PrivateKeyProviderConnector(
  makerPrivateKey,
  web3Instance
);

const sdk = new SDK({
  url: "https://api.1inch.dev/fusion",
  authKey: process.env.API_KEY,
  blockchainProvider,
});

const params = {
  srcChainId: NetworkEnum.ETHEREUM,
  dstChainId: NetworkEnum.GNOSIS,
  srcTokenAddress: "0x6b175474e89094c44da98b954eedeac495271d0f",
  dstTokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  amount: "1000000000000000000000",
  enableEstimate: true,
  walletAddress: makerAddress,
};

(async () => {
  try {
    const quote = get_quote(params);

    const secretsCount = quote.getPreset().secretsCount;

    const secrets = Array.from({ length: secretsCount }).map(() =>
      getRandomBytes32()
    );
    const secretHashes = secrets.map((x) => HashLock.hashSecret(x));

    const hashLock =
      secretsCount === 1
        ? HashLock.forSingleFill(secrets[0])
        : HashLock.forMultipleFills(
            secretHashes.map((secretHash, i) =>
              solidityPackedKeccak256(
                ["uint64", "bytes32"],
                [i, secretHash.toString()]
              )
            )
            // The type assertion `as (string & { _tag: "MerkleLeaf"; })[]` is removed
            // because JavaScript is dynamically typed and doesn't have compile-time type assertions.
            // The `map` function will still produce an array of strings (or whatever solidityPackedKeccak256 returns).
          );

    sdk
      .placeOrder(quote, {
        walletAddress: makerAddress,
        hashLock,
        secretHashes,
        // fee is an optional field
        fee: {
          takingFeeBps: 100, // 1% as we use bps format, 1% is equal to 100bps
          takingFeeReceiver: "0x0000000000000000000000000000000000000000", //  fee receiver address
        },
      })
      .then(console.log);
  } catch (err) {
    console.error("Error inside async block:", err);
  }
})();
