require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const {
  SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com",
  DEPLOYER_PRIVATE_KEY = "",
  ETHERSCAN_API_KEY = "",
  GANACHE_RPC_URL = "http://127.0.0.1:7545",
} = process.env;

// A private key is only needed for public-network deploys. Keep the accounts
// array empty otherwise so `hardhat compile`/`test` still work with no .env.
const sepoliaAccounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    ganache: {
      url: GANACHE_RPC_URL,
      chainId: 1337,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: sepoliaAccounts,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
