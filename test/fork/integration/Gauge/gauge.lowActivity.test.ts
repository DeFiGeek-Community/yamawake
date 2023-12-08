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

  describe("Gauge resilience following a period of low activity", function () {
    /*
    250週放置されても複数回checkpointを実行すれば同期完了できることを確認
    */
    it("should recover from passing more than 500 weeks where no one was active", async function () {
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
      const initialRate = await token.rate();

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
        1. 250週時間を進め、
        Aliceがcheckpointを2回呼ぶとAliceの報酬が最新まで正しく計算されることを確認
        その後checkpointTotalSupply,checkpointTokenを数回呼ぶと同期が完了することを確認
      */
      await time.increase(WEEK.mul(250));
      for (let i = 0; i < 5; i++) {
        await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      }

      const reward1 = await gauge.integrateFraction(accounts[1].address);
      const timeCursorOf1 = await gauge.timeCursorOf(accounts[1].address);
      const timeCursor1 = await gauge.timeCursor();
      const tokenTimeCursor1 = await gauge.tokenTimeCursor();

      await localSnapshot.restore();

      for (let i = 0; i < 5; i++) {
        await time.increase(WEEK.mul(50));
        await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      }

      const reward2 = await gauge.integrateFraction(accounts[1].address);
      const timeCursorOf2 = await gauge.timeCursorOf(accounts[1].address);
      const timeCursor2 = await gauge.timeCursor();
      const tokenTimeCursor2 = await gauge.tokenTimeCursor();

      // 各種ステータスが一致することを確認。rewardは複数のepochを跨ぐため、まとめて最新のrateで計算されるreward2の方が少なくなる
      expect(reward2).to.be.above(reward1);
      expect(timeCursorOf1).to.be.eq(timeCursorOf2);
      expect(timeCursor1).to.be.eq(timeCursor2);
      expect(tokenTimeCursor1).to.be.eq(tokenTimeCursor2);
    });

    /*
    500週間以上が経過した場合に、20週間ごとにBobがcheckpointしている場合、Aliceが2回checkpointを呼ぶとAliceの報酬が正しく計算され、最新の状態まで同期できることを確認
    */
    it("should recover from passing more than 500 weeks where 1 user was active", async function () {
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
      const initialRate = await token.rate();

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
        1. 合計500週間時間を進め、合間にBobがuserCheckpointを実行している場合、
        Aliceがcheckpointを2回呼ぶとAliceの報酬が最新まで正しく計算されることを確認
      */
      for (let i = 0; i < 25; i++) {
        await time.increase(WEEK.mul(20));
        await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);
      }

      // checkpoint前はAliceの報酬額が0であることを確認
      expect(await gauge.integrateFraction(accounts[1].address)).to.be.eq(0);
      // Aliceのcheckpointが正常に実行できることを確認
      await expect(
        gauge.connect(accounts[1]).userCheckpoint(accounts[1].address)
      ).to.not.be.reverted;
      let userTimeCursor1 = await gauge.timeCursorOf(accounts[1].address);
      let userEpoch1 = await gauge.userEpochOf(accounts[1].address);
      let reward1 = await gauge.integrateFraction(accounts[1].address);

      // Aliceのcheckpoint後に報酬が加算されていることを確認
      expect(reward1).to.be.above(0);

      // さらにAliceのcheckpointが正常に実行できることを確認
      for (let i = 0; i < 7; i++) {
        await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      }

      let userTimeCursor2 = await gauge.timeCursorOf(accounts[1].address);
      let userEpoch2 = await gauge.userEpochOf(accounts[1].address);
      let reward2 = await gauge.integrateFraction(accounts[1].address);
      // Aliceのcheckpoint後に報酬が加算されていることを確認
      expect(reward2).to.be.above(reward1);
      // Aliceのve履歴は変化していないためuserEpochも変化していないことを確認
      expect(userEpoch2).to.be.eq(userEpoch1);
      // AliceのTimeCursorが前回より進んでいることを確認
      expect(userTimeCursor2).to.be.above(userTimeCursor1);

      // さらにAliceのcheckpointが正常に実行できることを確認
      for (let i = 0; i < 3; i++) {
        await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      }

      // AliceのtimeCursorが最新のブロックタイムまで同期されていることを確認
      let userTimeCursor3 = await gauge.timeCursorOf(accounts[1].address);
      let userEpoch3 = await gauge.userEpochOf(accounts[1].address);
      let reward3 = await gauge.integrateFraction(accounts[1].address);
      // Aliceのcheckpoint後に報酬が加算されていないことを確認
      expect(reward3).to.be.eq(reward2);
      // Aliceのve履歴は変化していないためuserEpochも変化していないことを確認
      expect(userEpoch3).to.be.eq(userEpoch2);
      // AliceのTimeCursorが前回と変化していないことを確認
      expect(userTimeCursor3).to.be.eq(userTimeCursor2);

      /*
        2. AliceがYMWK lockをwithdrawし、再度checkpointすると、
        AliceのtimeCursorが現在のtokenTimeCursorまで同期されることを確認
      */
      await votingEscrow.connect(accounts[1]).withdraw();
      // さらにAliceのcheckpointが正常に実行できることを確認
      for (let i = 0; i < 8; i++) {
        await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      }
      let userTimeCursor4 = await gauge.timeCursorOf(accounts[1].address);
      expect(userTimeCursor4).to.be.eq(await gauge.tokenTimeCursor());

      const currentRate = await token.rate();
      const weekStart = tokenInflationStarts.div(WEEK).mul(WEEK);
      for (let i = 1; i < 500; i++) {
        const tokenByWeek = await gauge.tokensPerWeek(
          weekStart.add(WEEK.mul(i))
        );
        if (i < 52) {
          // 1年目は週間のトークン報酬額が1年目のレートを元に算出されていることを確認
          expect(tokenByWeek).to.be.eq(initialRate.mul(3600 * 24 * 7)); // 1054794520547945205033600
        } else if (i > 471) {
          // 最終週の週間トークン報酬額は最新のレートを元に算出されていることを確認
          expect(tokenByWeek).to.be.eq(currentRate.mul(3600 * 24 * 7)); // 408649008945205477612800
        }

        // console.log(`Week ${i} ${tokenByWeek.toString()}`);
      }
    });
  });
});