import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import Constants from "../../Constants";

describe("Gauge checkpoint", function () {
  let accounts: SignerWithAddress[];
  let gauges: Contract[];
  let snapshot: SnapshotRestorer;
  const year = Constants.year;
  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    // Contract factories
    const Token = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const GaugeController = await ethers.getContractFactory(
      "GaugeControllerV1"
    );
    const Minter = await ethers.getContractFactory("Minter");

    // Contract deployments
    const token = await Token.deploy();
    const votingEscrow = await VotingEscrow.deploy(
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    const gaugeController = await upgrades.deployProxy(GaugeController, [
      token.address,
      votingEscrow.address,
    ]);

    const minter = await Minter.deploy(token.address, gaugeController.address);

    const Gauge = await ethers.getContractFactory("Gauge");
    const lg1 = await Gauge.deploy(minter.address);
    gauges = [lg1, lg1, lg1];
  });
  afterEach(async () => {
    await snapshot.restore();
  });
  it("test_user_checkpoint", async function () {
    // Assuming `userCheckpoint` is a function on your contract
    await gauges[0].connect(accounts[1]).userCheckpoint(accounts[1].address);
  });
  it("test_user_checkpoint_new_period", async function () {
    await gauges[0].connect(accounts[1]).userCheckpoint(accounts[1].address);
    // Increase the time on the blockchain
    await time.increase(year * 1.1);
    await gauges[0].connect(accounts[1]).userCheckpoint(accounts[1].address);
  });
  it("test_user_checkpoint_wrong_account", async function () {
    // Expect the transaction to be reverted with the specified error message
    await expect(
      gauges[0].connect(accounts[1]).userCheckpoint(accounts[2].address)
    ).to.be.revertedWith("dev: unauthorized");
  });
});
