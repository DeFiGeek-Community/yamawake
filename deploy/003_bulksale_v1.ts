import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {
  deploy,
  getFoundation,
  extractEmbeddedFactoryAddress,
  backToInitMode
} from '../src/deployUtil';
import { addTemplate } from '../src/addTemplate';

const codename = "BulksaleV1";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const factoryAddress = extractEmbeddedFactoryAddress(codename);
  if (factoryAddress === null) {
    throw new Error("factory address is null");
  }
  console.log(`${codename} is deploying with factory=${factoryAddress}...`);

  const BulksaleV1 = await deploy(codename, {
    from: foundation,
    args: [],
    log: true,
    getContractFactory
  });

  try {
    await addTemplate(
      codename,
      factoryAddress,
      BulksaleV1.address
    );
  } catch (e: any) {
    console.trace(e.message);
  }
  backToInitMode(hre.network.name);
};
export default func;
func.tags = [codename];