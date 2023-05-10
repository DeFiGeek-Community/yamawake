import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {parseEther} from 'ethers/lib/utils';
import {
  deploy,
  getFoundation
} from '../src/deployUtil';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const {  getContractFactory} = ethers;
  const foundation = await getFoundation();

  await deploy('SampleToken', {
    from: foundation,
    args: [parseEther('115792089237316195423570985008687907853269984665640564039457')],
    log: true,
    getContractFactory
  });
};
export default func;
func.tags = ['SampleToken'];