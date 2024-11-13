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
  UpgradableMinterTest,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

describe("MinterV1", function () {
  let accounts: SignerWithAddress[];
  let minter: MinterV1 | UpgradableMinterTest;
  let votingEscrow: VotingEscrow;
  let gaugeController: GaugeControllerV1;
  let token: YMWK;
  let gauge: GaugeV1;

  let snapshot: SnapshotRestorer;
  let snapshotBeforeInflation: SnapshotRestorer;

  const GAUGE_WEIGHT = BigInt(1e18);
  const GAUGE_TYPE = 0;

  const DAY = 86400;
  const WEEK = DAY * 7;
  const MONTH = DAY * 30;
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
      "vetoken"
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

    snapshotBeforeInflation = await takeSnapshot();

    // Wait for the YMWK to start inflation
    await time.increase(INFLATION_DELAY);

    // Skip to the start of a new epoch week
    const currentWeek = Math.floor((await time.latest()) / WEEK) * WEEK;
    await time.increaseTo(currentWeek + WEEK);
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("MinterV1 Upgrade", function () {
    // Test basic mint functionality
    it("should upgrade successfully", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.parseEther("1"), (await time.latest()) + MONTH);

      await ethers.provider.send("evm_increaseTime", [MONTH]);

      await minter.connect(accounts[1]).mint(gauge.target); //gauge_address, msg.sender, mint
      // await showWeeklyTokens();
      let expected = await gauge.integrateFraction(accounts[1].address);

      expect(expected).to.be.gt(0);
      expect(await token.balanceOf(accounts[1].address)).to.equal(expected);

      const mintedAliceBefore = await minter.minted(
        accounts[1].address,
        gauge.target
      );
      expect(mintedAliceBefore).to.equal(expected);

      // 1) MinterV2へアップグレード
      const MinterV2 = await ethers.getContractFactory("UpgradableMinterTest");
      minter = (await upgrades.upgradeProxy(minter.target, MinterV2, {
        call: { fn: "initializeV2", args: [123] },
      })) as unknown as UpgradableMinterTest;
      await gauge.waitForDeployment();

      // 2) GaugeV1のデータを保持していることを確認
      const mintedAliceAfter = await minter.minted(
        accounts[1].address,
        gauge.target
      );
      expect(mintedAliceBefore).to.be.eq(mintedAliceAfter);

      // 3) GaugeV1の新しいパラメータを保持していることを確認
      expect(await minter.newParam()).to.be.eq(123);

      // 4) GaugeV1の新しい関数を実行できることを確認
      await minter.newMethod();
      expect(await minter.newParam()).to.be.eq(124);
    });
  });
});
