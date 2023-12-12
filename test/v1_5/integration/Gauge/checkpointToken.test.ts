import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import Constants from "../../Constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Gauge", function () {
  let accounts: SignerWithAddress[];
  let gaugeController: Contract;
  let token: Contract;
  let votingEscrow: Contract;
  let gauge: Contract;
  let minter: Contract;

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
    const GaugeController = await ethers.getContractFactory(
      "GaugeControllerV1"
    );
    const Minter = await ethers.getContractFactory("Minter");
    const Gauge = await ethers.getContractFactory("Gauge");

    token = await YMWK.deploy();
    await token.deployed();

    votingEscrow = await VotingEscrow.deploy(
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.deployed();

    gaugeController = await upgrades.deployProxy(GaugeController, [
      token.address,
      votingEscrow.address,
    ]);
    await gaugeController.deployed();

    minter = await Minter.deploy(token.address, gaugeController.address);
    await minter.deployed();

    gauge = await Gauge.deploy(minter.address);
    await gauge.deployed();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("Gauge checkpoint", function () {
    /*
    1日ごとに複数回TokenCheckpointしても報酬額は変わらないことを確認
    */
    it("should make no differenses to rewards regardless of frequency of checkpoint execution", async function () {
      // Gaugeの追加
      await gaugeController.addGauge(
        gauge.address,
        1,
        BigNumber.from(10).pow(18)
      );

      // YMWKトークンを送信
      const creatorBalance = await token.balanceOf(accounts[0].address);
      await token.transfer(accounts[1].address, creatorBalance.div(2));
      await token.transfer(accounts[2].address, creatorBalance.div(2));

      // YMWKインフレーション開始週頭まで時間を進める
      const tokenInflationStarts: BigNumber = (
        await token.startEpochTime()
      ).add(INFLATION_DELAY);

      await time.increaseTo(tokenInflationStarts);
      await token.updateMiningParameters();

      // Aliceのロック
      let amountAlice = BigNumber.from(10).pow(18).mul(4);
      let durationAlice = YEAR * 4;
      let now = await time.latest();
      await token
        .connect(accounts[1])
        .approve(votingEscrow.address, amountAlice);
      const lockedUntilAlice = now + durationAlice;
      await votingEscrow
        .connect(accounts[1])
        .createLock(amountAlice, lockedUntilAlice);

      // Bobのロック
      let amountBob = BigNumber.from(10).pow(18).mul(5);
      let durationBob = YEAR * 2;
      await token.connect(accounts[2]).approve(votingEscrow.address, amountBob);
      const lockedUntilBob = now + durationBob;
      await votingEscrow
        .connect(accounts[2])
        .createLock(amountBob, lockedUntilBob);

      const localSnapshot = await takeSnapshot();
      /*
        1. AliceとBobが1日ごとにcheckpointを実行した場合と数ヶ月ごとにcheckpointした場合で報酬額が変わらない事を確認
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

      // 50日ごとにcheckpointを実行し100日間経過した場合と報酬額が同じことを確認
      await localSnapshot.restore();
      for (let i = 0; i < 2; i++) {
        await time.increase(DAY * 50);
        await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
        await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);
      }
      const rewardAlice2 = await gauge.integrateFraction(accounts[1].address);
      const rewardBob2 = await gauge.integrateFraction(accounts[2].address);
      expect(rewardAlice2).to.be.eq(rewardAlice1);
      expect(rewardBob2).to.be.eq(rewardBob1);
    });

    /*
    tokenCheckpointのみを複数回実行している状態でもuserCheckpoint実行後にtimeCursor以降の報酬計算がされないことを確認
    */
    it("should not proceed furthur than timeCursor", async function () {
      // Gaugeの追加
      await gaugeController.addGauge(
        gauge.address,
        1,
        BigNumber.from(10).pow(18)
      );

      // YMWKトークンを送信
      const creatorBalance = await token.balanceOf(accounts[0].address);
      await token.transfer(accounts[1].address, creatorBalance.div(2));
      await token.transfer(accounts[2].address, creatorBalance.div(2));

      // YMWKインフレーション開始週頭まで時間を進める
      const tokenInflationStarts: BigNumber = (
        await token.startEpochTime()
      ).add(INFLATION_DELAY);

      await time.increaseTo(tokenInflationStarts);
      await token.updateMiningParameters();

      // Aliceのロック
      let amountAlice = BigNumber.from(10).pow(18).mul(4);
      let durationAlice = YEAR * 4;
      let now = await time.latest();
      await token
        .connect(accounts[1])
        .approve(votingEscrow.address, amountAlice);
      const lockedUntilAlice = now + durationAlice;
      await votingEscrow
        .connect(accounts[1])
        .createLock(amountAlice, lockedUntilAlice);

      // Bobのロック
      let amountBob = BigNumber.from(10).pow(18).mul(5);
      let durationBob = YEAR * 2;
      await token.connect(accounts[2]).approve(votingEscrow.address, amountBob);
      const lockedUntilBob = now + durationBob;
      await votingEscrow
        .connect(accounts[2])
        .createLock(amountBob, lockedUntilBob);

      /*
        1. 合計500週間時間を進め、1度checkpointTotalSupplyを呼ぶ。
      */
      await time.increase(WEEK.mul(500));
      await gauge.checkpointTotalSupply();

      // timeCursorが20週間経過後の週頭時点のタイムスタンプになっていることを確認
      const timeCursor1 = await gauge.timeCursor();
      expect(timeCursor1).to.be.eq(
        BigNumber.from(now).div(WEEK).add(20).mul(WEEK)
      );

      /*
        2. checkpointTokenを2回呼ぶ
      */
      await gauge.checkpointToken();
      await gauge.checkpointToken();

      // tokenTimeCursorがtimeCursorから20週間進んだ時点であることを確認
      const tokenTimeCursor = await gauge.tokenTimeCursor();
      expect(tokenTimeCursor).to.be.eq(timeCursor1.add(WEEK.mul(20)));

      /*
        3. Aliceのcheckpointを2回実行する
      */
      await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);

      // userTimeCursorがtimeCursorと同じであることを確認
      const userTimeCursor = await gauge.timeCursorOf(accounts[1].address);
      const timeCursor2 = await gauge.timeCursor();
      expect(userTimeCursor).to.be.eq(timeCursor2);
    });
  });
});
