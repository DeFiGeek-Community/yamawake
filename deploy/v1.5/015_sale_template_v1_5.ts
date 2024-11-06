import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import prompts from "prompts";
import {
  deploy,
  getFoundation,
  getContractAddress,
  existsDeployedContract,
} from "../../src/deployUtil";
import { addTemplate } from "../../src/addTemplate";
import { TemplateV1_5 } from "../../typechain-types";

const codename = "TemplateV1_5";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // Deploy only to L1
  if (!hre.network.tags.receiver) {
    console.log(`${codename} is intended for deployment on L1 only`);
    return;
  }

  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const factoryAddress = getContractAddress(hre.network.name, "Factory");
  const feeDistributorAddress = getContractAddress(
    hre.network.name,
    "FeeDistributorV1"
  );
  const distributorAddress = getContractAddress(
    hre.network.name,
    "DistributorReceiver"
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

  let TemplateV1_5: TemplateV1_5;
  if (!existsDeployedContract(hre.network.name, codename)) {
    console.log(
      `${codename} is deploying with factory=${factoryAddress}, feeDistributorAddress=${feeDistributorAddress}, distributorAddress=${distributorAddress}...`
    );

    TemplateV1_5 = (await deploy(codename, {
      from: foundation,
      args: [factoryAddress, feeDistributorAddress, distributorAddress],
      log: true,
      getContractFactory,
    })) as unknown as TemplateV1_5;
  } else {
    TemplateV1_5 = (await getContractFactory(codename)).attach(
      getContractAddress(hre.network.name, codename)
    ) as TemplateV1_5;
    console.log(`${codename} is already deployed. skipping deploy...`);
  }

  const Factory = await ethers.getContractAt(
    "Factory",
    factoryAddress,
    foundation
  );
  const factoryOwner = await Factory.owner();
  const foundationAddress = foundation.address;

  // Check if the account who is deploying contracts is equal to Factory's owner
  if (foundationAddress !== factoryOwner) {
    console.log(
      `[WARN] Template requires to be added manually by current Factory owner address ${factoryOwner}. Skipping addTemplate process...`
    );
  } else {
    try {
      await addTemplate(
        hre.network.name,
        codename, // Template name
        factoryAddress,
        String(TemplateV1_5.target)
      );
    } catch (e: any) {
      console.trace(e.message);
    }
  }
};
export default func;
func.tags = [codename, "V1.5"];
