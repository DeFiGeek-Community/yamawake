import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
  existsDeployedContract,
} from "../../src/deployUtil";

const codename = "VotingEscrow";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (existsDeployedContract(hre.network.name, codename)) {
    console.log(`${codename} is already deployed. skipping deploy...`);
    return;
  }

  // Deploy only to L1
  if (!hre.network.tags.receiver) {
    console.log(`${codename} is intended for deployment on L1 only`);
    return;
  }

  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const ymwkAddress = getContractAddress(hre.network.name, "YMWK");
  if (ymwkAddress === null) {
    throw new Error("YMWK address is null");
  }
  console.log(`${codename} is deploying with YMWK=${ymwkAddress}...`);

  await deploy(codename, {
    from: foundation,
    args: [ymwkAddress, "Voting-escrowed Yamawake", "veYMWK"],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = [codename, "V1.5"];
