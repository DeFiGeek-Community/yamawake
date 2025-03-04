import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
  existsDeployedContract,
} from "../../src/deployUtil";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!hre.network.tags.local) {
    // Skip processing because it is deprecated
    console.log(
      `Distributor is deprecated. No need to deploy to ${hre.network.name}. Skipping deployment...`
    );
    return;
  } else {
    console.log(
      `Distributor is deprecated, but proceeding with the deployment to ${hre.network.name} anyway`
    );
  }

  if (existsDeployedContract(hre.network.name, "Distributor")) {
    console.log(`Distributor is already deployed. skipping deploy...`);
    return;
  }

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
