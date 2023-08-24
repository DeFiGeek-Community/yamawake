import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deploy, getFoundation, getContractAddress } from "../src/deployUtil";
import { addTemplate } from "../src/addTemplate";

const codename = "TemplateV1";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const factoryAddress = getContractAddress(hre.network.name, "Factory");
  const feePoolAddress = getContractAddress(hre.network.name, "FeePool");
  const distributorAddress = getContractAddress(hre.network.name, "Distributor");
  if (factoryAddress === null || feePoolAddress === null || distributorAddress === null) {
    throw new Error("factory, feepool or distributorAddress address is null");
  }
  console.log(`${codename} is deploying with factory=${factoryAddress}...`);

  const TemplateV1 = await deploy(codename, {
    from: foundation,
    args: [factoryAddress, feePoolAddress, distributorAddress],
    log: true,
    getContractFactory,
  });

  try {
    await addTemplate(
      hre.network.name,
      codename,
      factoryAddress,
      TemplateV1.address,
    );
  } catch (e: any) {
    console.trace(e.message);
  }
};
export default func;
func.tags = [codename];
