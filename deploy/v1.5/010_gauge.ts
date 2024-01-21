import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
  existsDeployedContract,
} from "../../src/deployUtil";

const codename = "Gauge";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (existsDeployedContract(hre.network.name, codename)) {
    console.log(`${codename} is already deployed. skipping deploy...`);
    return;
  }
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const minterAddress = getContractAddress(hre.network.name, "Minter");
  if (minterAddress === null) {
    throw new Error("Minter address is null");
  }
  const INFLATION_DELAY = 86400 * 365;
  const YMWK = (await getContractFactory("YMWK")).attach(
    getContractAddress(hre.network.name, "YMWK")
  );
  const tokenInflationStarts = (await YMWK.startEpochTime()).add(
    INFLATION_DELAY
  );
  console.log(
    `${codename} is deploying with Minter=${minterAddress},  startTime=${tokenInflationStarts}...`
  );

  await deploy(codename, {
    from: foundation,
    args: [minterAddress, tokenInflationStarts],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = [codename, "V1.5"];
