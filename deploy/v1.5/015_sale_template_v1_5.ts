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
    "FeeDistributor"
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
    // If a deployment address for TemplateV1 already exists, ask the user for confirmation.
    // This applies when replacing the old Distributor settings of TemplateV1 deployed on L1 with a CCIP-compatible Distributor setting,
    // or during deployment in a local development environment.
    const response = await prompts({
      type: "confirm",
      name: "value",
      message: `Looks like TemplateV1_5 is deployed already. Do you want to proceed with the deployment with DistributorReceiver?`,
      initial: false,
    });

    if (response.value) {
      console.log(`${codename} is deploying with factory=${factoryAddress}...`);

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
