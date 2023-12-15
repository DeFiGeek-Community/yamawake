import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
} from "../../src/deployUtil";
import { addTemplate } from "../../src/addTemplate";

const codename = "TemplateV1_5";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const factoryAddress = getContractAddress(hre.network.name, "Factory");
  const feeDistributorAddress = getContractAddress(
    hre.network.name,
    "FeeDistributor"
  );
  const distributorAddress = getContractAddress(
    hre.network.name,
    "Distributor"
  );
  if (
    factoryAddress === null ||
    feeDistributorAddress === null ||
    distributorAddress === null
  ) {
    throw new Error(
      "factory, feeDistributorAddress or distributorAddress address is null"
    );
  }
  console.log(
    `${codename} is deploying with factory=${factoryAddress}, feeDistributorAddress=${feeDistributorAddress}, distributorAddress=${distributorAddress}...`
  );

  const TemplateV1_5 = await deploy(codename, {
    from: foundation,
    // ABI: "TemplateV1_5",
    args: [factoryAddress, feeDistributorAddress, distributorAddress],
    log: true,
    getContractFactory,
  });

  try {
    await addTemplate(
      hre.network.name,
      codename, // Template name
      factoryAddress,
      TemplateV1_5.address
    );
  } catch (e: any) {
    console.trace(e.message);
  }
};
export default func;
func.tags = [codename, "V1.5"];
