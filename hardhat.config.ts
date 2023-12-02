require("dotenv").config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-gas-reporter";
import "@openzeppelin/hardhat-upgrades";

const { INFURA_API_TOKEN, ETHERSCAN_API_KEY, FOUNDATION_PRIVATE_KEY } = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.18",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000,
      },
    },
  },
  networks: {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_TOKEN}`,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${INFURA_API_TOKEN}`,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_TOKEN}`,
      accounts: [`${FOUNDATION_PRIVATE_KEY}`],
      saveDeployments: true,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"],
    },
    hardhat: {
      // forking: {
      //   url: `https://mainnet.infura.io/v3/${INFURA_API_TOKEN}`,
      // },
      accounts: {
        count: 110,
        initialIndex: 0,
        accountsBalance: "200000000000000000000000",
      },
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    deployments: 'hardhat-deployments',
  },
  gasReporter: {
    enabled: true
  }
};

export default config;
