import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
} from "../../src/deployUtil";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (getContractAddress(hre.network.name, "Factory")) {
    console.log(`Factory is already deployed. skipping deploy...`);
    return;
  }

  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();

  await deploy("Factory", {
    from: foundation,
    args: [],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = ["Factory", "V1"];
