require("dotenv").config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-gas-reporter";
import "@openzeppelin/hardhat-upgrades";

const { INFURA_API_TOKEN, ETHERSCAN_API_KEY, BASESCAN_API_KEY, FOUNDATION_PRIVATE_KEY } =
  process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000,
      },
    },
  },
  mocha: {
    timeout: 60000,
  },
  networks: {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_TOKEN}`,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
      tags: ["prod", "receiver"],
    },
    holesky: {
      url: `https://holesky.infura.io/v3/${INFURA_API_TOKEN}`,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
      tags: ["test", "receiver"],
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_TOKEN}`,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
      tags: ["test", "receiver"],
    },
    base_sepolia: {
      url: `https://sepolia.base.org`,
      chainId: 84532,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
      tags: ["test", "sender"],
    },
    base_mainnet: {
      url: `https://mainnet.base.org`,
      chainId: 8453,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
      tags: ["prod", "sender"],
    },
    hardhat: {
      accounts: {
        count: 110,
        initialIndex: 0,
        accountsBalance: "200000000000000000000000",
      },
      tags: ["test", "receiver", "local"],
    },
    localhost: {
      tags: ["test", "receiver", "local"],
      forking: {
        url: `https://sepolia.infura.io/v3/${INFURA_API_TOKEN}`,
      },
    },
    localhost_l2: {
      url: "http://127.0.0.1:8546",
      forking: {
        url: `https://arbitrum-sepolia.infura.io/v3/${INFURA_API_TOKEN}`,
      },
      chainId: 31338,
      tags: ["test", "sender"],
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      baseSepolia: BASESCAN_API_KEY,
      base: BASESCAN_API_KEY,
    },
  },
  paths: {
    deployments: "hardhat-deployments",
  },
  gasReporter: {
    enabled: true,
  },
  mocha: {
    timeout: 100000,
  },
};

export default config;
