import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
} from "../../src/deployUtil";

const codename = "Gauge";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const minterAddress = getContractAddress(hre.network.name, "Minter");
  if (minterAddress === null) {
    throw new Error("Minter address is null");
  }
  console.log(`${codename} is deploying with Minter=${minterAddress} ...`);

  await deploy(codename, {
    from: foundation,
    args: [minterAddress],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = [codename, "V1.5"];
