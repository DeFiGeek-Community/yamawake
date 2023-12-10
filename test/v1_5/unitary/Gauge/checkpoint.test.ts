import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import Constants from "../../Constants";

describe("Gauge checkpoint", function () {
  const DAY = 86400;
  const WEEK = DAY * 7;
  const YEAR = DAY * 365;

  let accounts: SignerWithAddress[];
  let gauge: Contract;
  let token: Contract;
  let votingEscrow: Contract;
  let snapshot: SnapshotRestorer;
  const year = Constants.year;
  const INFLATION_DELAY = BigNumber.from(YEAR);

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
    token = await Token.deploy();
    votingEscrow = await VotingEscrow.deploy(
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
    gauge = await Gauge.deploy(minter.address);
  });
  afterEach(async () => {
    await snapshot.restore();
  });
  it("test_user_checkpoint", async function () {
    await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
  });
  it("test_user_checkpoint_new_period", async function () {
    await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
    // Increase the time on the blockchain
    await time.increase(year * 1.1);
    await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
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
      await token.approve(votingEscrow.address, ethers.constants.MaxUint256);
      await votingEscrow.createLock(
        ethers.utils.parseEther("1000"),
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
      const startTime = (await gauge.timeCursor()).toNumber();
      await time.increase(INFLATION_DELAY.div(2));
      await gauge.checkpointTotalSupply();
      let newTimeCursor = await gauge.timeCursor();
      expect(newTimeCursor).to.equal(startTime);

      await time.increase(INFLATION_DELAY.div(2));
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
      const start_time: BigNumber = await gauge.timeCursor();
      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);
      expect(await gauge.timeCursor()).to.equal(start_time);
    });
  });

  describe("test_checkpoints_after_inflation_start", () => {
    /*
    YMWKインフレーションスタート後のチェックポイントの動き
    */
    beforeEach(async function () {
      const tokenInflationStarts: BigNumber = (
        await token.startEpochTime()
      ).add(INFLATION_DELAY);
      await time.increaseTo(tokenInflationStarts);
      await token.approve(votingEscrow.address, ethers.constants.MaxUint256);
      await votingEscrow.createLock(
        ethers.utils.parseEther("1000"),
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
      const startTime = (await gauge.timeCursor()).toNumber();
      await time.increase(YEAR * 3);
      await gauge.checkpointTotalSupply();
      const newTimeCursor = (await gauge.timeCursor()).toNumber();
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
      const start_time: BigNumber = await gauge.timeCursor();

      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);

      expect(await gauge.timeCursor()).to.equal(start_time.add(WEEK));
    });

    /*

    */
    it("test_user_checkpoint_checkpoints_with_many_ve_activity", async function () {
      const start_time: BigNumber = await gauge.timeCursor();
      for (let i = 0; i < 100; i++) {
        await votingEscrow.increaseAmount(ethers.utils.parseEther("1"));
      }
      await time.increase(WEEK * 4);
      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);

      // userPointHistoryを50同期する。timeCursorOfが1週間だけ進んでいることを確認
      expect(await gauge.timeCursorOf(accounts[0].address)).to.equal(
        start_time.add(WEEK)
      );
      // userPointHistoryをさらに50同期する。timeCursorOfが変化していないことを確認
      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);
      expect(await gauge.timeCursorOf(accounts[0].address)).to.equal(
        start_time.add(WEEK)
      );

      // userPointHistoryの同期が完了しているのでtimeCursorOfが最新に更新されることを確認
      await gauge.connect(accounts[0]).userCheckpoint(accounts[0].address);
      expect(await gauge.timeCursorOf(accounts[0].address)).to.equal(
        start_time.add(WEEK * 4)
      );
    });
  });
});
