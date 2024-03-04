import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
  existsDeployedContract,
} from "../../src/deployUtil";

const codename = "Gauge";
const INFLATION_DELAY = 86400 * 365;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (existsDeployedContract(hre.network.name, codename)) {
    console.log(`${codename} is already deployed. skipping deploy...`);
    return;
  }
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const minterAddress = getContractAddress(hre.network.name, "Minter");
  const ymwkAddress = getContractAddress(hre.network.name, "YMWK");
  const controllerAddress = getContractAddress(
    hre.network.name,
    "GaugeControllerV1"
  );
  if (
    minterAddress === null ||
    ymwkAddress === null ||
    controllerAddress === null
  ) {
    throw new Error("Minter, YMWK or GaugeController address is null");
  }
  const ymwk = (await getContractFactory("YMWK")).attach(ymwkAddress);
  const tokenInflationStarts = (await ymwk.startEpochTime()).add(
    INFLATION_DELAY
  );
  console.log(
    `${codename} is deploying with Minter=${minterAddress},  startTime=${tokenInflationStarts}...`
  );

  const gauge = await deploy(codename, {
    from: foundation,
    args: [minterAddress, tokenInflationStarts],
    log: true,
    getContractFactory,
  });

  const gaugeController = (
    await getContractFactory("GaugeControllerV1")
  ).attach(controllerAddress);

  console.log(
    `Adding Gauge (${gauge.address}) to GaugeController (${gaugeController.address}) ...`
  );
  try {
    await gaugeController.addGauge(gauge.address, 0, 1);
  } catch (e: any) {
    console.trace(e.message);
  }
};
export default func;
func.tags = [codename, "V1.5"];
