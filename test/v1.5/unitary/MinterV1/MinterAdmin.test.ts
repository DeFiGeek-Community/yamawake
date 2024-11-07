import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  GaugeV1,
  GaugeControllerV1,
  MinterV1,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

describe("MinterV1 Admin", function () {
  let accounts: SignerWithAddress[];
  let minter: MinterV1;
  let votingEscrow: VotingEscrow;
  let gaugeController: GaugeControllerV1;
  let token: YMWK;
  let gauge: GaugeV1;

  let snapshot: SnapshotRestorer;

  const GAUGE_WEIGHT = BigInt(1e18);
  const GAUGE_TYPE = 0;

  const DAY = 86400;
  const WEEK = DAY * 7;
  const YEAR = DAY * 365;
  const INFLATION_DELAY = YEAR;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();

    const YMWK = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const GaugeController =
      await ethers.getContractFactory("GaugeControllerV1");
    const Minter = await ethers.getContractFactory("MinterV1");
    const Gauge = await ethers.getContractFactory("GaugeV1");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    gaugeController = (await upgrades.deployProxy(GaugeController, [
      token.target,
      votingEscrow.target,
    ])) as unknown as GaugeControllerV1;
    await gaugeController.waitForDeployment();

    minter = (await upgrades.deployProxy(Minter, [
      token.target,
      gaugeController.target,
    ])) as unknown as MinterV1;
    await minter.waitForDeployment();

    const tokenInflationStarts =
      (await token.startEpochTime()) + BigInt(INFLATION_DELAY);
    gauge = (await upgrades.deployProxy(Gauge, [
      minter.target,
      tokenInflationStarts,
    ])) as unknown as GaugeV1;
    await gauge.waitForDeployment();

    // Set minter for the token
    await token.setMinter(minter.target);

    // Add gauge
    await gaugeController.addGauge(gauge.target, GAUGE_TYPE, GAUGE_WEIGHT);

    // YMWKを各アカウントに配布し、votingEscrowからの使用をapprove
    for (const account of accounts) {
      await token.transfer(account.address, ethers.parseEther("1"));
      await token
        .connect(account)
        .approve(votingEscrow.target, ethers.parseEther("1"));
    }

    // Wait for the YMWK to start inflation
    await time.increase(INFLATION_DELAY);

    // Skip to the start of a new epoch week
    const currentWeek = Math.floor((await time.latest()) / WEEK) * WEEK;
    await time.increaseTo(currentWeek + WEEK);
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_admin", function () {
    it("test_commit_admin_only", async function () {
      await expect(
        minter.connect(accounts[1]).commitTransferOwnership(accounts[1].address)
      ).to.be.revertedWith("admin only");
    });

    it("test_apply_admin_only", async function () {
      await expect(
        minter.connect(accounts[1]).applyTransferOwnership()
      ).to.be.revertedWith("admin only");
    });

    it("test_commit_transfer_ownership", async function () {
      await minter.commitTransferOwnership(accounts[1].address);

      expect(await minter.admin()).to.equal(await accounts[0].getAddress());
      expect(await minter.futureAdmin()).to.equal(accounts[1].address);
    });

    it("test_apply_transfer_ownership", async function () {
      await minter.commitTransferOwnership(accounts[1].address);
      await minter.applyTransferOwnership();

      expect(await minter.admin()).to.equal(accounts[1].address);
    });

    it("test_apply_without_commit", async function () {
      await expect(minter.applyTransferOwnership()).to.be.revertedWith(
        "admin not set"
      );
    });
  });
});
