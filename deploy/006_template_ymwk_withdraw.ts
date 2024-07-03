import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import {
  deploy,
  getFoundation,
  getContractAddress,
  existsDeployedContract,
} from "../src/deployUtil";

const codename = "TemplateYMWKWithdraw";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!hre.network.tags.receiver) {
    console.log(
      `TemplateYMWKWithdraw should be deployed only to receiver network. Skipping deployment...`
    );
    return;
  }
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const factoryAddress = getContractAddress(hre.network.name, "Factory");
  const feePoolAddress = getContractAddress(hre.network.name, "FeePool");
  const distributorAddress = getContractAddress(
    hre.network.name,
    "Distributor",
  );
  if (
    factoryAddress === null ||
    feePoolAddress === null ||
    distributorAddress === null
  ) {
    throw new Error("factory, feepool or distributorAddress address is null");
  }

  let TemplateYMWKWithdraw;
  if (!existsDeployedContract(hre.network.name, "TemplateYMWKWithdraw")) {
    console.log(`${codename} is deploying with factory=${factoryAddress}...`);

    TemplateYMWKWithdraw = await deploy(codename, {
      from: foundation,
      args: [factoryAddress, feePoolAddress, distributorAddress],
      log: true,
      getContractFactory,
    });
  } else {
    TemplateYMWKWithdraw = (await getContractFactory(codename)).attach(
      getContractAddress(hre.network.name, "TemplateYMWKWithdraw"),
    );
    console.log(`${codename} is already deployed. skipping deploy...`);
  }
};
export default func;
func.tags = [codename];
