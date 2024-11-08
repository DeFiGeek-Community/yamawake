import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  getFoundation,
  getContractAddress,
  existsDeployedContract,
  deployProxy,
} from "../../src/deployUtil";
import { GaugeControllerV1, YMWK } from "../../typechain-types";

const codename = "GaugeV1";
const INFLATION_DELAY = 86400 * 365;

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
  const minterAddress = getContractAddress(hre.network.name, "MinterV1");
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
  const ymwk = (await getContractFactory("YMWK")).attach(ymwkAddress) as YMWK;
  const tokenInflationStarts =
    (await ymwk.startEpochTime()) + BigInt(INFLATION_DELAY);
  console.log(
    `${codename} is deploying with Minter=${minterAddress},  startTime=${tokenInflationStarts}...`
  );

  const gauge = await deployProxy(codename, {
    from: foundation,
    args: [minterAddress, tokenInflationStarts],
    log: true,
    getContractFactory,
  });

  const gaugeController = (
    await getContractFactory("GaugeControllerV1")
  ).attach(controllerAddress) as GaugeControllerV1;

  console.log(
    `Adding Gauge (${gauge.target}) to GaugeController (${gaugeController.target}) ...`
  );
  try {
    await gaugeController.addGauge(gauge.target, 0, 1);
  } catch (e: any) {
    console.trace(e.message);
  }
};
export default func;
func.tags = [codename, "V1.5"];
