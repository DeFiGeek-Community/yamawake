import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {
  deploy,
  hardcodeFactoryAddress,
  getFoundation,
  isEmbeddedMode,
  goToEmbededMode
} from '../src/deployUtil';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if( isEmbeddedMode(hre.network.name) ) return;
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();

  const factory = await deploy('FactoryV1', {
    from: foundation,
    args: [],
    log: true,
    getContractFactory
  });

  hardcodeFactoryAddress("BulksaleV1", factory.address);
  
  goToEmbededMode(hre.network.name);

  console.log("\nPlanned checkpoint. You can continue by running the same command again.\n");
  process.exit(0);
};
export default func;
func.tags = ['Factory'];
