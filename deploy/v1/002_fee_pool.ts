import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deploy, getFoundation } from "../../src/deployUtil";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers } = hre;
  const { getContractFactory } = ethers;
  const foundation = await getFoundation();

  await deploy("FeePool", {
    from: foundation,
    args: [],
    log: true,
    getContractFactory,
  });
};
export default func;
func.tags = ["FeePool", "V1"];
