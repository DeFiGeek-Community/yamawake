import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
  existsDeployedContract,
} from "../../src/deployUtil";

const tagName = "DistributorSender";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (existsDeployedContract(hre.network.name, tagName)) {
    console.log(`${tagName} is already deployed. skipping deploy...`);
    return;
  }
  if (!hre.network.tags.sender) {
    return;
  }

  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const factoryAddress = getContractAddress(hre.network.name, "Factory");
  const routerAddress = getContractAddress(hre.network.name, "Router");

  await deploy(tagName, {
    from: foundation,
    args: [factoryAddress, routerAddress],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = [tagName];
