require("dotenv").config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-gas-reporter";

const { INFURA_API_TOKEN, ETHERSCAN_API_KEY, FOUNDATION_PRIVATE_KEY } =
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
    },
    holesky: {
      url: `https://holesky.infura.io/v3/${INFURA_API_TOKEN}`,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_TOKEN}`,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    hardhat: {
      accounts: {
        count: 110,
        initialIndex: 0,
        accountsBalance: "2000000000000000000000",
      },
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    deployments: "hardhat-deployments",
  },
  gasReporter: {
    enabled: true,
  },
};

export default config;
