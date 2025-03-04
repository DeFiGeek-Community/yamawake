import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  existsDeployedContract,
  getFoundation,
} from "../../src/deployUtil";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!hre.network.tags.receiver) {
    console.log(
      `YMWK should be deployed only to receiver network. Skipping deployment...`
    );
    return;
  }

  if (existsDeployedContract(hre.network.name, "YMWK")) {
    console.log(`YMWK is already deployed. skipping deploy...`);
    return;
  }

  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();

  await deploy("YMWK", {
    from: foundation,
    args: [],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = ["YMWK", "V1"];
