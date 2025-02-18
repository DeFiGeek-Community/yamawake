import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import Constants from "../../../lib/Constants";
import { RewardGaugeV1, VotingEscrow, YMWK } from "../../../../typechain-types";

describe("Gauge checkpoint", function () {
  const DAY = 86400;
  const WEEK = DAY * 7;
  const YEAR = DAY * 365;

  let accounts: SignerWithAddress[];
  let gauge: RewardGaugeV1;
  let token: YMWK;
  let votingEscrow: VotingEscrow;
  let snapshot: SnapshotRestorer;
  const year = Constants.year;
  const INFLATION_DELAY = BigInt(year);

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    // Contract factories
    const Token = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const GaugeController =
      await ethers.getContractFactory("GaugeControllerV1");
    const Gauge = await ethers.getContractFactory("RewardGaugeV1");
    const Minter = await ethers.getContractFactory("MinterV1");

    // Contract deployments
    token = await Token.deploy();
    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken"
    );
    const gaugeController = await upgrades.deployProxy(GaugeController, [
      token.target,
      votingEscrow.target,
    ]);

    const minter = await upgrades.deployProxy(Minter, [
      token.target,
      gaugeController.target,
    ]);

    const tokenInflationStarts: bigint =
      (await token.startEpochTime()) + INFLATION_DELAY;
    gauge = (await upgrades.deployProxy(Gauge, [
      minter.target,
      tokenInflationStarts,
    ])) as unknown as RewardGaugeV1;
  });
  afterEach(async () => {
    await snapshot.restore();
  });
  it("test_user_checkpoint", async function () {
    await expect(gauge.connect(accounts[1]).userCheckpoint(accounts[1].address))
      .to.not.be.reverted;
  });
  it("test_user_checkpoint_new_period", async function () {
    await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
    // Increase the time on the blockchain
    await time.increase(year * 1.1);
    await expect(gauge.connect(accounts[1]).userCheckpoint(accounts[1].address))
      .to.not.be.reverted;
  });
  it("test_user_checkpoint_wrong_account", async function () {
    // Expect the transaction to be reverted with the specified error message
    await expect(
      gauge.connect(accounts[1]).userCheckpoint(accounts[2].address)
    ).to.be.revertedWith("dev: unauthorized");
  });

  describe("test_checkpoints_before_inflation_start", () => {
    /*
    YMWKインフレーションスタート前のチェックポイントの動き
    */
    beforeEach(async function () {
      /*
      前提条件: Aliceが52週間1000YMWKをロックする
      */
      await token.approve(votingEscrow.target, ethers.MaxUint256);
      await votingEscrow.createLock(
        ethers.parseEther("1000"),
        (await time.latest()) + WEEK * 52
      );
    });

    /*
      インフレスタート前のcheckpointTotalSupplyではveを同期しないことを確認
    */
    it("test_checkpoint_total_supply", async function () {
      const startTime = await gauge.timeCursor();
      const weekEpoch =
        Math.floor(((await time.latest()) + WEEK) / WEEK) * WEEK;

      await time.increaseTo(weekEpoch);
      await gauge.checkpointTotalSupply();

      expect(await gauge.veSupply(startTime)).to.equal(0);
      expect(await gauge.veSupply(weekEpoch)).to.equal(0);
    });

    /*
      インフレスタート前のcheckpointTotalSupplyではtimeCursorが変化しないことを確認。
      インフレスタート後のcheckpointTotalSupplyではtimeCursorが変化することを確認。
    */
    it("test_advance_time_cursor", async function () {
      const startTime = await gauge.timeCursor();
      await time.increase(INFLATION_DELAY / 2n);
      await gauge.checkpointTotalSupply();
      let newTimeCursor = await gauge.timeCursor();
      expect(newTimeCursor).to.equal(startTime);

      await time.increase(INFLATION_DELAY / 2n);
      await gauge.checkpointTotalSupply();
      newTimeCursor = await gauge.timeCursor();
      expect(newTimeCursor).to.equal(
        Math.floor((await time.latest()) / WEEK) * WEEK + WEEK
      );
    });

    /*
      インフレスタート前のuserCheckpointではtimeCursorが変化しないことを確認。
    */
    it("test_user_checkpoint_checkpoints_total_supply", async function () {
      const start_time: bigint = await gauge.timeCursor();
      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);
      expect(await gauge.timeCursor()).to.equal(start_time);
    });
  });

  describe("test_checkpoints_after_inflation_start", () => {
    /*
    YMWKインフレーションスタート後のチェックポイントの動き
    */
    beforeEach(async function () {
      const tokenInflationStarts: bigint =
        (await token.startEpochTime()) + INFLATION_DELAY;
      await time.increaseTo(tokenInflationStarts);
      await token.approve(votingEscrow.target, ethers.MaxUint256);
      await votingEscrow.createLock(
        ethers.parseEther("1000"),
        (await time.latest()) + WEEK * 52 * 3
      );
    });

    it("test_checkpoint_total_supply", async function () {
      const startTime = await gauge.timeCursor();
      const weekEpoch =
        Math.floor(((await time.latest()) + WEEK) / WEEK) * WEEK;

      await time.increaseTo(weekEpoch);

      const weekBlock = await time.latestBlock();

      await gauge.checkpointTotalSupply();

      expect(await gauge.veSupply(startTime)).to.equal(0);
      expect(await gauge.veSupply(weekEpoch)).to.equal(
        await votingEscrow.totalSupplyAt(weekBlock)
      );
    });

    it("test_advance_time_cursor", async function () {
      const startTime = Number(await gauge.timeCursor());
      await time.increase(YEAR * 3);
      await gauge.checkpointTotalSupply();
      const newTimeCursor = await gauge.timeCursor();
      expect(newTimeCursor).to.equal(startTime + WEEK * 20);
      expect(await gauge.veSupply(startTime + WEEK * 19)).to.be.above(0);
      expect(await gauge.veSupply(startTime + WEEK * 20)).to.equal(0);

      await gauge.checkpointTotalSupply();

      expect(await gauge.timeCursor()).to.equal(startTime + WEEK * 40);
      expect(await gauge.veSupply(startTime + WEEK * 20)).to.be.above(0);
      expect(await gauge.veSupply(startTime + WEEK * 39)).to.be.above(0);
      expect(await gauge.veSupply(startTime + WEEK * 40)).to.equal(0);
    });

    it("test_user_checkpoint_checkpoints_total_supply", async function () {
      const start_time = Number(await gauge.timeCursor());

      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);

      expect(await gauge.timeCursor()).to.equal(start_time + WEEK);
    });

    /*

    */
    it("test_user_checkpoint_checkpoints_with_many_ve_activity", async function () {
      const start_time = Number(await gauge.timeCursor());
      for (let i = 0; i < 100; i++) {
        await votingEscrow.increaseAmount(ethers.parseEther("1"));
      }
      await time.increase(WEEK * 4);
      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);

      // userPointHistoryを50同期する。timeCursorOfが1週間だけ進んでいることを確認
      expect(await gauge.timeCursorOf(accounts[0].address)).to.equal(
        start_time + WEEK
      );
      // userPointHistoryをさらに50同期する。timeCursorOfが変化していないことを確認
      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);
      expect(await gauge.timeCursorOf(accounts[0].address)).to.equal(
        start_time + WEEK
      );

      // userPointHistoryの同期が完了しているのでtimeCursorOfが最新に更新されることを確認
      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);
      expect(await gauge.timeCursorOf(accounts[0].address)).to.equal(
        start_time + WEEK * 4
      );
    });
  });
});
