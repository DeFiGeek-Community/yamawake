import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {
  deploy,
  getFoundation,
  extractEmbeddedFactoryAddress,
  recoverFactoryAddress,
  backToInitMode
} from '../src/deployUtil';
import { addTemplate } from '../src/addTemplate';


const codename = "OwnableToken";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();
  const factoryAddress = extractEmbeddedFactoryAddress(codename);
  if (factoryAddress === null) {
    throw new Error("factory address is null");
  }
  console.log(`${codename} is deploying with factory=${factoryAddress}...`);
  
  const OwnableTokenV1 = await deploy(codename, {
    from: foundation,
    args: [],
    log: true,
    getContractFactory
  });

  let _tokenTemplateKey:string|undefined;
  try {
    _tokenTemplateKey = await addTemplate(
      codename,
      factoryAddress,
      OwnableTokenV1.address
    );
  } catch (e: any) {
    console.trace(e.message);
    backToInitMode(hre.network.name);
  }
};
export default func;
func.tags = [codename];