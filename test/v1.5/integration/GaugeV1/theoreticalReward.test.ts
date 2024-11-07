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
} from "../../../../typechain-types";

/*
  報酬理論値の検証
  https://www.desmos.com/calculator/9qm15hlyjq
  以下の条件で1年後のYMWK報酬が理論値と一致することを確認する
  Alice: locks 4 YMWK for 4 years
  Bob: locks 5 YMWK for 2 years
*/
describe("GaugeV1", function () {
  let accounts: SignerWithAddress[];
  let gaugeController: GaugeControllerV1;
  let token: YMWK;
  let votingEscrow: VotingEscrow;
  let gauge: GaugeV1;
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

  it("should match theoretical value", async function () {
    /* 
      0. 前提条件の設定 
    */
    // Gaugeの追加
    await gaugeController.addGauge(gauge.target, 1, BigInt(1e18));

    // YMWKトークンをAlice, Bobに均等に送信する
    const creatorBalance = await token.balanceOf(accounts[0].address);
    await token.transfer(accounts[1].address, creatorBalance / 2n);
    await token.transfer(accounts[2].address, creatorBalance / 2n);

    /*
     1. YMWKインフレーション開始時間まで進め、YMWKのレートを更新する
    */
    const tokenInflationStarts =
      (await token.startEpochTime()) + BigInt(INFLATION_DELAY);
    const weekStart = (tokenInflationStarts / WEEK) * WEEK;
    await time.increaseTo(tokenInflationStarts);
    await token.updateMiningParameters();
    const initialRate = await token.rate();

    /*
      2. Aliceが4YMWK、4年間ロック
    */
    let amountAlice = BigInt(1e18) * 4n;
    let durationAlice = YEAR * 4;
    let now = await time.latest();
    await token.connect(accounts[1]).approve(votingEscrow.target, amountAlice);
    const lockedUntilAlice = now + durationAlice;
    await votingEscrow
      .connect(accounts[1])
      .createLock(amountAlice, lockedUntilAlice);

    /*
      3. Bobが5YMWK、2年間ロック
    */
    let amountBob = BigInt(1e18) * 5n;
    let durationBob = YEAR * 2;
    await token.connect(accounts[2]).approve(votingEscrow.target, amountBob);
    const lockedUntilBob = now + durationBob;
    await votingEscrow
      .connect(accounts[2])
      .createLock(amountBob, lockedUntilBob);

    /*
      4. 52週間時間を進める
    */
    await time.increase(WEEK * 18n);
    await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
    await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);

    await time.increase(WEEK * 18n);
    await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
    await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);

    await time.increase(WEEK * 16n);
    await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
    await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);
    let timeCursor = await gauge.timeCursor();

    /*
      5. 理論値と実績値を計算し、VotingEscrowから取得したveバランスとgaugeから取得したveバランスの履歴が等しいことを確認
       |-◯-|---|-...-|---|-*-|
       0   1   2     51  52  53
       ◯:  tokenInflationStarts
       0:  weekStart
       1:  veYMWKの反映開始
       52: tokenTimeCursor
       53: timeCursor
       *:  現在
    */
    // 期間中のYMWKリワード理論値: 最初の週と最後の週は除外し、1〜51週目まで（全51週分）の報酬額の理論値を計算
    let theoreticalTokenTotal =
      (timeCursor - weekStart - WEEK * 2n) * initialRate;
    // ゲージに記録されたのYMWKリワード実績値
    let tokenByWeekTotal = 0n;
    // VotingEscrowから取得した値を元に計算するAliceのYMWKリワード理論値
    let expectedAliceReward = 0n;
    // VotingEscrowから取得した値を元に計算するBobのYMWKリワード理論値
    let expectedBobReward = 0n;
    for (let i = 1; i < 52; i++) {
      // 各週のVotingEscrow残高をVotingEscrowコントラクトから取得し、リワードの理論値を計算する
      // WEEK0の途中でロックするのでWEEK0の頭時点ではVE残高は0。WEEK1から計算スタート
      const tokenByWeek = await gauge.tokensPerWeek(
        weekStart + WEEK * BigInt(i)
      );
      tokenByWeekTotal = tokenByWeekTotal + tokenByWeek;
      const supply = await votingEscrow["totalSupply(uint256)"](
        weekStart + WEEK * BigInt(i)
      );
      const balanceAlice = await votingEscrow["balanceOf(address,uint256)"](
        accounts[1].address,
        weekStart + WEEK * BigInt(i)
      );
      expectedAliceReward =
        expectedAliceReward + (tokenByWeek * balanceAlice) / supply;
      const balanceBob = await votingEscrow["balanceOf(address,uint256)"](
        accounts[2].address,
        weekStart + WEEK * BigInt(i)
      );
      expectedBobReward =
        expectedBobReward + (tokenByWeek * balanceBob) / supply;

      // VotingEscrowから取得した値とgaugeから取得した値に相違がないことを確認
      expect(supply).to.be.eq(
        await gauge.veSupply(weekStart + WEEK * BigInt(i))
      );
      expect(balanceAlice).to.be.eq(
        await gauge.veForAt(accounts[1].address, weekStart + WEEK * BigInt(i))
      );
      expect(balanceBob).to.be.eq(
        await gauge.veForAt(accounts[2].address, weekStart + WEEK * BigInt(i))
      );
    }

    /*
      6. YWMKリワードの理論値と実績値が等しいことを確認
    */
    expect(theoreticalTokenTotal).to.be.eq(tokenByWeekTotal);

    /*
      7. AliceとBobのYWMKリワードの理論値と実績値が等しいことを確認
    */
    expect(await gauge.integrateFraction(accounts[1].address)).to.be.eq(
      expectedAliceReward
    );
    expect(await gauge.integrateFraction(accounts[2].address)).to.be.eq(
      expectedBobReward
    );

    /*
      8. 1週間時間を進めてYMWKのステータスを更新
      |-◯-|-*-|
      52  53  54
      ◯:  開始
      *:  時間を進めた後（YMWKのfutureEpochTime）
    */
    const newWeekStart = weekStart + WEEK * 52n;
    await time.increase(WEEK);
    await token.updateMiningParameters();
    const nextEpochStart = await token.startEpochTime();
    const newRate = await token.rate();

    /*
      9. さらに9週間時間を進め、期間中に得られるリワードの理論値を計算する
      |-◯-|---|-...-|---|-*-|
      53  54  55    61  62  63
      ◯:  開始
      *:  時間を進めた後
      62: tokenTimeCursor
      63: timeCursor
    */
    await time.increase(WEEK * 9n);
    await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
    await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);
    const newTimeCursor = await gauge.timeCursor();

    for (let i = 0; i < 10; i++) {
      // 各週のVotingEscrow残高をVotingEscrowコントラクトから取得し、リワードの理論値を計算する
      const tokenByWeek = await gauge.tokensPerWeek(
        newWeekStart + WEEK * BigInt(i)
      );
      tokenByWeekTotal = tokenByWeekTotal + tokenByWeek;
      const supply = await votingEscrow["totalSupply(uint256)"](
        newWeekStart + WEEK * BigInt(i)
      );
      const balanceAlice = await votingEscrow["balanceOf(address,uint256)"](
        accounts[1].address,
        newWeekStart + WEEK * BigInt(i)
      );
      expectedAliceReward =
        expectedAliceReward + (tokenByWeek * balanceAlice) / supply;
      const balanceBob = await votingEscrow["balanceOf(address,uint256)"](
        accounts[2].address,
        newWeekStart + WEEK * BigInt(i)
      );
      expectedBobReward =
        expectedBobReward + (tokenByWeek * balanceBob) / supply;

      expect(supply).to.be.eq(
        await gauge.veSupply(newWeekStart + WEEK * BigInt(i))
      );
      expect(balanceAlice).to.be.eq(
        await gauge.veForAt(
          accounts[1].address,
          newWeekStart + WEEK * BigInt(i)
        )
      );
      expect(balanceBob).to.be.eq(
        await gauge.veForAt(
          accounts[2].address,
          newWeekStart + WEEK * BigInt(i)
        )
      );
    }

    // 前回（52週間後）のリワード額合計にそれ以降に追加されるリワードの理論値を足し合わせ、
    // 現時点でのリワード理論値を計算する
    theoreticalTokenTotal =
      theoreticalTokenTotal +
      (nextEpochStart - newWeekStart) * initialRate +
      (newTimeCursor - nextEpochStart - WEEK) * newRate;

    /*
      10. YWMKリワードの理論値と実績値が等しいことを確認
    */
    expect(theoreticalTokenTotal).to.be.eq(tokenByWeekTotal);

    /*
      11. AliceとBobのYWMKリワードの理論値と実績値が等しいことを確認
    */
    expect(await gauge.integrateFraction(accounts[1].address)).to.be.eq(
      expectedAliceReward
    );
    expect(await gauge.integrateFraction(accounts[2].address)).to.be.eq(
      expectedBobReward
    );
  });
});
