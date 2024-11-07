import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import Constants from "../../../lib/Constants";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  GaugeV1,
  GaugeControllerV1,
  MinterV1,
  VotingEscrow,
  YMWK,
  UpgradableGaugeTest,
} from "../../../../typechain-types";

/*
  checkpointTotalSupply, checkpointToken, userCheckpointの
  順序、頻度によって整合性が崩れないことを確認
*/
describe("GaugeV1", function () {
  let accounts: SignerWithAddress[];
  let gaugeController: GaugeControllerV1;
  let token: YMWK;
  let votingEscrow: VotingEscrow;
  let gauge: GaugeV1 | UpgradableGaugeTest;
  let minter: MinterV1;

  let snapshot: SnapshotRestorer;
  const WEEK = Constants.WEEK;
  const DAY = 86400;
  const YEAR = DAY * 365;
  const INFLATION_DELAY = YEAR;

  beforeEach(async () => {
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
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("GaugeV1 Upgrade", function () {
    /*
    報酬額がV2に保持されることを確認
    */
    it("should upgrade successfully", async function () {
      // Gaugeの追加
      await gaugeController.addGauge(gauge.target, 1, BigInt(1e18));

      // YMWKトークンを送信
      const creatorBalance = await token.balanceOf(accounts[0].address);
      await token.transfer(accounts[1].address, creatorBalance / 2n);
      await token.transfer(accounts[2].address, creatorBalance / 2n);

      // YMWKインフレーション開始週頭まで時間を進める
      const tokenInflationStarts =
        (await token.startEpochTime()) + BigInt(INFLATION_DELAY);

      await time.increaseTo(tokenInflationStarts);
      await token.updateMiningParameters();

      // Aliceのロック
      let amountAlice = BigInt(1e18) * 4n;
      let durationAlice = YEAR * 4;
      let now = await time.latest();
      await token
        .connect(accounts[1])
        .approve(votingEscrow.target, amountAlice);
      const lockedUntilAlice = now + durationAlice;
      await votingEscrow
        .connect(accounts[1])
        .createLock(amountAlice, lockedUntilAlice);

      // Bobのロック
      let amountBob = BigInt(1e18) * 5n;
      let durationBob = YEAR * 2;
      await token.connect(accounts[2]).approve(votingEscrow.target, amountBob);
      const lockedUntilBob = now + durationBob;
      await votingEscrow
        .connect(accounts[2])
        .createLock(amountBob, lockedUntilBob);

      /*
        1. AliceとBobが1日ごとにcheckpointを実行し、報酬データがV2に引き継がれていることを確認
      */

      // checkpoint前はAlice, Bobの報酬額が0であることを確認
      expect(await gauge.integrateFraction(accounts[1].address)).to.be.eq(0);
      expect(await gauge.integrateFraction(accounts[2].address)).to.be.eq(0);

      // 1日ごとにcheckpointを実行し100日経過する
      for (let i = 0; i < 100; i++) {
        await time.increase(DAY);
        await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
        await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);
      }

      const rewardAlice1 = await gauge.integrateFraction(accounts[1].address);
      const rewardBob1 = await gauge.integrateFraction(accounts[2].address);

      // 報酬が加算されていることを確認
      expect(rewardAlice1).to.be.above(0);
      expect(rewardBob1).to.be.above(0);

      // 1) FeeDistributorV2へアップグレード
      const GaugeV2 = await ethers.getContractFactory("UpgradableGaugeTest");
      gauge = (await upgrades.upgradeProxy(gauge.target, GaugeV2, {
        call: { fn: "initializeV2", args: [123] },
      })) as unknown as UpgradableGaugeTest;
      await gauge.waitForDeployment();

      // 2) GaugeV1のデータを保持していることを確認
      const rewardAlice1After = await gauge.integrateFraction(
        accounts[1].address
      );
      const rewardBob1After = await gauge.integrateFraction(
        accounts[2].address
      );
      expect(rewardAlice1).to.be.eq(rewardAlice1After);
      expect(rewardBob1).to.be.eq(rewardBob1After);

      // 3) GaugeV1の新しいパラメータを保持していることを確認
      expect(await gauge.newParam()).to.be.eq(123);

      // 4) GaugeV1の新しい関数を実行できることを確認
      await gauge.newMethod();
      expect(await gauge.newParam()).to.be.eq(124);
    });
  });
});
