const {
  // getRandomBytes32,
  SDK,
  HashLock,
  PrivateKeyProviderConnector,
  NetworkEnum,
  PresetEnum,
} = require("@1inch/cross-chain-sdk");
const {
  solidityPackedKeccak256,
  randomBytes,
  Contract,
  Wallet,
  JsonRpcProvider,
} = require("ethers");
const { Web3 } = require("web3");
const dotenv = require("dotenv");
dotenv.config();

const erc20Abi = require("./abi.js");

const TOKEN_ADDRESS = "0xc5fecC3a29Fb57B5024eEc8a2239d4621e111CBE"; // 1inch on base
const SPENDER = "0x111111125421ca6dc452d289314280a0f8842a65";

async function approveTransfer(amount) {
  try {
    const provider = new JsonRpcProvider("https://base-rpc.publicnode.com");
    const signer = new Wallet(process.env.PRIVATE_KEY, provider);
    const tokenContract = new Contract(TOKEN_ADDRESS, erc20Abi, signer);
    
    const tx = await tokenContract.approve(SPENDER, amount);
    const receipt = await tx.wait();
    console.log("Approval transaction:", receipt);
    return receipt;
  } catch (error) {
    console.error("Approval error:", error);
    return null;
  }
}

function getRandomBytes32() {
  // for some reason the cross-chain-sdk expects a leading 0x and can't handle a 32 byte long hex string
  return "0x" + Buffer.from(randomBytes(32)).toString("hex");
}

const makerPrivateKey = process.env.PRIVATE_KEY;
const makerAddress = process.env.ADDRESS;
const nodeUrl = "https://base-rpc.publicnode.com";
const web3Instance = new Web3(nodeUrl);

const blockchainProvider = new PrivateKeyProviderConnector(
  makerPrivateKey,
  web3Instance
);

const sdk = new SDK({
  url: "https://api.1inch.dev/fusion-plus",
  authKey: process.env.ONE_INCH_API_KEY,
  blockchainProvider,
});

const params = {
  srcChainId: NetworkEnum.COINBASE,
  dstChainId: NetworkEnum.ARBITRUM,
  srcTokenAddress: "0xc5fecC3a29Fb57B5024eEc8a2239d4621e111CBE", //1inch on base
  dstTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", //usdc on arbitrum
  amount: "10000000000000000000", // 10 1inch
  enableEstimate: true,
  walletAddress: makerAddress,
};

const source = "sdk-tutorial";

(async () => {
  try {
    const result = await approveTransfer(10000000000000000000);
    console.log("Approval result:", result);

    if (!result) {
      console.log("Approval failed, stopping process");
      return;
    }

    try {
      const quote = await sdk.getQuote(params);

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
            );
      try {
        const { hash, quoteId, order } = await sdk.createOrder(quote, {
          makerAddress,
          hashLock,
          preset: PresetEnum.fast,
          source,
          secretHashes,
        });
        console.log({ hash, quoteId, order }, "order created");

        try {
          const orderInfo = await sdk.submitOrder(
            quote.srcChainId,
            order,
            quoteId,
            secretHashes
          );
          console.log("Order submitted successfully:", orderInfo);
        } catch (submitError) {
          if (submitError.response?.data) {
            console.error("Submit order error:", JSON.stringify(submitError.response.data, null, 2));
          } else {
            console.error("Submit order error:", submitError);
          }
        }
      } catch (createOrderError) {
        if (createOrderError.response?.data) {
          console.error("Create order error:", JSON.stringify(createOrderError.response.data, null, 2));
        } else {
          console.error("Create order error:", createOrderError);
        }
      }
    } catch (quoteError) {
      console.error("Error getting quote:", quoteError);
    }
  } catch (error) {
    console.error("Script execution error:", error);
  }
})();
