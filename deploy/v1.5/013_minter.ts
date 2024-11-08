import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deployProxy,
  getFoundation,
  getContractAddress,
  existsDeployedContract,
} from "../../src/deployUtil";

const codename = "MinterV1";

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
  const ymwkAddress = getContractAddress(hre.network.name, "YMWK");
  const gaugeControllerAddress = getContractAddress(
    hre.network.name,
    "GaugeControllerV1"
  );
  if (ymwkAddress === null || gaugeControllerAddress === null) {
    throw new Error("YMWK address or GaugeControllerV1 address is null");
  }
  console.log(
    `${codename} is deploying with YMWK=${ymwkAddress}, GaugeControllerV1=${gaugeControllerAddress} ...`
  );

  await deployProxy(codename, {
    from: foundation,
    args: [ymwkAddress, gaugeControllerAddress],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = [codename, "V1.5"];
