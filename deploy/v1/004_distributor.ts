import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
} from "../../src/deployUtil";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const factoryAddress = getContractAddress(hre.network.name, "Factory");
  const ymwkAddress = getContractAddress(hre.network.name, "YMWK");

  await deploy("Distributor", {
    from: foundation,
    args: [factoryAddress, ymwkAddress],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = ["Distributor", "V1"];
