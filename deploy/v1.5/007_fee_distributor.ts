import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
  existsDeployedContract,
} from "../../src/deployUtil";

const codename = "FeeDistributor";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (existsDeployedContract(hre.network.name, codename)) {
    console.log(`${codename} is already deployed. skipping deploy...`);
    return;
  }
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const votingEscrowAddress = getContractAddress(
    hre.network.name,
    "VotingEscrow"
  );
  const factoryAddress = getContractAddress(hre.network.name, "Factory");
  if (votingEscrowAddress === null || factoryAddress === null) {
    throw new Error("VotingEscrow address or Factory address is null");
  }
  const WEEK = 3600 * 24 * 7;
  const startTime = Math.floor(new Date().getTime() / 1000 / WEEK) * WEEK;

  console.log(
    `${codename} is deploying with startTime=${startTime} VotingEscrow=${votingEscrowAddress}, Factory=${factoryAddress} ...`
  );

  await deploy(codename, {
    from: foundation,
    args: [votingEscrowAddress, factoryAddress, startTime],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = [codename, "V1.5"];
