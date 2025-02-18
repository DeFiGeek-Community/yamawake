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

const codename = "TemplateV1";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!hre.network.tags.sender && !hre.network.tags.receiver) {
    throw Error("Network should be tagged with 'sender' or 'receiver'");
  }
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const factoryAddress = getContractAddress(hre.network.name, "Factory");
  const feePoolAddress = getContractAddress(hre.network.name, "FeePool");
  const distributorContractName = hre.network.tags.sender
    ? "DistributorSender"
    : "DistributorReceiver";
  const distributorAddress = getContractAddress(
    hre.network.name,
    distributorContractName
  );

  if (
    factoryAddress === null ||
    feePoolAddress === null ||
    distributorAddress === null
  ) {
    throw new Error("factory, feepool or distributorAddress address is null");
  }

  let TemplateV1;
  if (!existsDeployedContract(hre.network.name, codename)) {
    console.log(`${codename} is deploying with factory=${factoryAddress}...`);

    TemplateV1 = await deploy(codename, {
      from: foundation,
      args: [factoryAddress, feePoolAddress, distributorAddress],
      log: true,
      getContractFactory,
    });
  } else {
    // If a deployment address for TemplateV1 already exists, ask the user for confirmation.
    // This applies when replacing the old Distributor settings of TemplateV1 deployed on L1 with a CCIP-compatible Distributor setting,
    // or during deployment in a local development environment.
    const response = await prompts({
      type: "confirm",
      name: "value",
      message: `Looks like TemplateV1 is deployed already. Do you want to proceed with the deployment with ${distributorContractName}?`,
      initial: false,
    });

    if (response.value) {
      console.log(`${codename} is deploying with factory=${factoryAddress}...`);

      TemplateV1 = await deploy(codename, {
        from: foundation,
        args: [factoryAddress, feePoolAddress, distributorAddress],
        log: true,
        getContractFactory,
      });
    } else {
      TemplateV1 = (await getContractFactory(codename)).attach(
        getContractAddress(hre.network.name, codename)
      );
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
        codename,
        factoryAddress,
        TemplateV1.target.toString()
      );
    } catch (e: any) {
      console.error(e.message);
    }
  }
};
export default func;
func.tags = [codename, "V1"];
