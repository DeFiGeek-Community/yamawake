import { ethers } from "hardhat";

async function deployContracts() {
  const [creator, alice, bob, charly] = await ethers.getSigners();

  // Constants
  const TYPE_WEIGHTS = [
    ethers.utils.parseUnits("1", 17),
    ethers.utils.parseUnits("1", 18),
  ];
  const GAUGE_WEIGHTS = [
    ethers.utils.parseUnits("1", 18),
    ethers.utils.parseUnits("1", 18),
    ethers.utils.parseUnits("1", 17),
  ];
  const TEN_TO_THE_21 = ethers.utils.parseUnits("1", 21);

  // Contract factories
  const Token = await ethers.getContractFactory("YMWK");
  const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
  const GaugeController = await ethers.getContractFactory("GaugeController");
  const LiquidityGauge = await ethers.getContractFactory("LiquidityGaugeV6");
  const Minter = await ethers.getContractFactory("Minter");

  // Contract deployments
  const token = await Token.deploy();
  const votingEscrow = await VotingEscrow.deploy(
    token.address,
    "Voting-escrowed token",
    "vetoken",
    "v1"
  );
  const gaugeController = await GaugeController.deploy(
    token.address,
    votingEscrow.address
  );
  const minter = await Minter.deploy(token.address, gaugeController.address);

  const lg1 = await LiquidityGauge.deploy(minter.address);
  const lg2 = await LiquidityGauge.deploy(minter.address);
  const lg3 = await LiquidityGauge.deploy(minter.address);

  await token.setMinter(minter.address);

  return {
    creator,
    alice,
    bob,
    charly,
    token,
    votingEscrow,
    gaugeController,
    minter,
    threeGauges: [lg1.address, lg2.address, lg3.address],
    gauges: [lg1, lg2, lg3],
  };
}

export { deployContracts };
