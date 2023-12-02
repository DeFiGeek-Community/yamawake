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
  let factory: Contract;
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
    const Factory = await ethers.getContractFactory("Factory");
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

    factory = await Factory.deploy();
    await factory.deployed();

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

  describe("Gauge Integral Calculations Static", function () {
    /*
    下記理論値の検証
    https://www.desmos.com/calculator/9qm15hlyjq
    以下の条件で1年後のYMWK報酬が理論値と一致することを確認する
    Alice: locks 4 YMWK for 4 years
    Bob: locks 5 YMWK for 2 years
    */
    it("should match theoretical value", async function () {
      /* 前提条件の設定 */
      // Gaugeの追加
      await gaugeController.addGauge(
        gauge.address,
        1,
        BigNumber.from(10).pow(18)
      );

      // YMWKトークンをAlice, Bobに均等に送信する
      const creatorBalance = await token.balanceOf(accounts[0].address);
      await token.transfer(accounts[1].address, creatorBalance.div(2));
      await token.transfer(accounts[2].address, creatorBalance.div(2));

      /*
        1. YMWKインフレーション開始時間まで進め、YMWKのレートを更新する
      */
      const tokenInflationStarts: BigNumber = (
        await token.startEpochTime()
      ).add(INFLATION_DELAY);
      const weekStart = tokenInflationStarts.div(WEEK).mul(WEEK);
      await time.increaseTo(tokenInflationStarts);
      await token.updateMiningParameters();
      const initialRate = await token.rate();

      /*
        2. Aliceが4YMWK、4年間ロック
      */
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

      /*
        3. Bobが5YMWK、2年間ロック
      */
      let amountBob = BigNumber.from(10).pow(18).mul(5);
      let durationBob = YEAR * 2;
      await token.connect(accounts[2]).approve(votingEscrow.address, amountBob);
      const lockedUntilBob = now + durationBob;
      await votingEscrow
        .connect(accounts[2])
        .createLock(amountBob, lockedUntilBob);

      /*
        4. 52週間時間を進める
      */
      await time.increase(WEEK.mul(18));
      await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);

      await time.increase(WEEK.mul(18));
      await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);

      await time.increase(WEEK.mul(16));
      await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);
      let timeCursor = await gauge.timeCursor();

      /*
        5. 理論値と実績値の計算し、VotingEscrowから取得したveバランスとgaugeから取得したveバランスの履歴が等しいことを確認
      */
      // 期間中のYMWKリワード理論値
      let theoreticalTokenTotal = timeCursor
        .sub(weekStart)
        .sub(WEEK.mul(2)) //最初の週と最後の週は対象外
        .mul(initialRate);
      // ゲージに記録されたのYMWKリワード実績値
      let tokenByWeekTotal = BigNumber.from("0");
      // VotingEscrowから取得した値を元に計算するAliceのYMWKリワード理論値
      let expectedAliceReward = BigNumber.from("0");
      // VotingEscrowから取得した値を元に計算するBobのYMWKリワード理論値
      let expectedBobReward = BigNumber.from("0");
      for (let i = 1; i < 52; i++) {
        // 各週のVotingEscrow残高をVotingEscrowコントラクトから取得し、リワードの理論値を計算する
        // WEEK0の途中でロックするのでWEEK0の頭時点ではVE残高は0。WEEK1から計算スタート
        const tokenByWeek = await gauge.tokensPerWeek(
          weekStart.add(WEEK.mul(i))
        );
        tokenByWeekTotal = tokenByWeekTotal.add(tokenByWeek);
        const supply = await votingEscrow["totalSupply(uint256)"](
          weekStart.add(WEEK.mul(i))
        );
        const balanceAlice = await votingEscrow["balanceOf(address,uint256)"](
          accounts[1].address,
          weekStart.add(WEEK.mul(i))
        );
        expectedAliceReward = expectedAliceReward.add(
          tokenByWeek.mul(balanceAlice).div(supply)
        );
        const balanceBob = await votingEscrow["balanceOf(address,uint256)"](
          accounts[2].address,
          weekStart.add(WEEK.mul(i))
        );
        expectedBobReward = expectedBobReward.add(
          tokenByWeek.mul(balanceBob).div(supply)
        );

        expect(supply).to.be.eq(
          await gauge.veSupply(weekStart.add(WEEK.mul(i)))
        );
        expect(balanceAlice).to.be.eq(
          await gauge.veForAt(accounts[1].address, weekStart.add(WEEK.mul(i)))
        );
        expect(balanceBob).to.be.eq(
          await gauge.veForAt(accounts[2].address, weekStart.add(WEEK.mul(i)))
        );
        // console.log(
        //   `WEEK ${i} ${tokenByWeek} Rate: ${initialRate} Alice Expected: ${expectedAliceReward.toString()}`
        // );
        // console.log("WEEK", weekStart.add(WEEK.mul(i)).div(WEEK).toString());
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

      // console.log(
      //   "After Phase1: ",
      //   theoreticalTokenTotal.toString(),
      //   expectedAliceReward.toString(),
      //   expectedBobReward.toString()
      // );

      /*
        8. 1週間時間を進めてYMWKのステータスを更新
      */
      const newWeekStart = weekStart.add(WEEK.mul(52));
      await time.increase(WEEK);
      await token.updateMiningParameters();
      const nextEpochStart = await token.startEpochTime();
      const newRate = await token.rate();

      /*
        9. さらに9週間時間を進め、期間中に得られるリワードの理論値を計算する
      */

      await time.increase(WEEK.mul(9));
      await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
      await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);
      const newTimeCursor = await gauge.timeCursor();

      for (let i = 0; i < 10; i++) {
        // 各週のVotingEscrow残高をVotingEscrowコントラクトから取得し、リワードの理論値を計算する
        const tokenByWeek = await gauge.tokensPerWeek(
          newWeekStart.add(WEEK.mul(i))
        );
        tokenByWeekTotal = tokenByWeekTotal.add(tokenByWeek);
        const supply = await votingEscrow["totalSupply(uint256)"](
          newWeekStart.add(WEEK.mul(i))
        );
        const balanceAlice = await votingEscrow["balanceOf(address,uint256)"](
          accounts[1].address,
          newWeekStart.add(WEEK.mul(i))
        );
        expectedAliceReward = expectedAliceReward.add(
          tokenByWeek.mul(balanceAlice).div(supply)
        );
        const balanceBob = await votingEscrow["balanceOf(address,uint256)"](
          accounts[2].address,
          newWeekStart.add(WEEK.mul(i))
        );
        expectedBobReward = expectedBobReward.add(
          tokenByWeek.mul(balanceBob).div(supply)
        );
        // console.log("WEEK", newWeekStart.add(WEEK.mul(i)).div(WEEK).toString());

        expect(supply).to.be.eq(
          await gauge.veSupply(newWeekStart.add(WEEK.mul(i)))
        );
        expect(balanceAlice).to.be.eq(
          await gauge.veForAt(
            accounts[1].address,
            newWeekStart.add(WEEK.mul(i))
          )
        );
        expect(balanceBob).to.be.eq(
          await gauge.veForAt(
            accounts[2].address,
            newWeekStart.add(WEEK.mul(i))
          )
        );
      }

      // 前回（52週間後）のリワード額合計にそれ以降に追加されるリワードの理論値を足し合わせ、
      // 現時点でのリワード理論値を計算する
      theoreticalTokenTotal = theoreticalTokenTotal
        .add(nextEpochStart.sub(newWeekStart).mul(initialRate))
        .add(newTimeCursor.sub(nextEpochStart).sub(WEEK).mul(newRate));

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

      // console.log(
      //   "After Phase2: ",
      //   theoreticalTokenTotal.toString(),
      //   expectedAliceReward.toString(),
      //   expectedBobReward.toString()
      // );
    });

    /*
    // 500週間以上誰も操作せずに時間が経過した場合に、最新の状態まで同期できることを確認
    // */
    // it("should recover from passing more than 500 weeks", async function () {
    //   // Gaugeの追加
    //   await gaugeController.addGauge(
    //     gauge.address,
    //     1,
    //     BigNumber.from(10).pow(18)
    //   );

    //   // YMWKトークンを送信
    //   const creatorBalance = await token.balanceOf(accounts[0].address);
    //   await token.transfer(accounts[1].address, creatorBalance.div(2));
    //   await token.transfer(accounts[2].address, creatorBalance.div(2));

    //   // YMWKインフレーション開始週頭まで時間を進める
    //   const tokenInflationStarts: BigNumber = (
    //     await token.startEpochTime()
    //   ).add(INFLATION_DELAY);

    //   await time.increaseTo(tokenInflationStarts);
    //   await token.updateMiningParameters();

    //   // Aliceのロック
    //   let amountAlice = BigNumber.from(10).pow(18).mul(4);
    //   let durationAlice = YEAR * 4;
    //   let now = await time.latest();
    //   await token
    //     .connect(accounts[1])
    //     .approve(votingEscrow.address, amountAlice);
    //   const lockedUntilAlice = now + durationAlice;
    //   await votingEscrow
    //     .connect(accounts[1])
    //     .createLock(amountAlice, lockedUntilAlice);

    //   // Bobのロック
    //   let amountBob = BigNumber.from(10).pow(18).mul(5);
    //   let durationBob = YEAR * 2;
    //   await token.connect(accounts[2]).approve(votingEscrow.address, amountBob);
    //   const lockedUntilBob = now + durationBob;
    //   await votingEscrow
    //     .connect(accounts[2])
    //     .createLock(amountBob, lockedUntilBob);

    //   // 505週間時間を進める
    //   await time.increase(WEEK.mul(505));

    //   // zero division error
    //   await expect(
    //     gauge.connect(accounts[1]).userCheckpoint(accounts[1].address)
    //   ).to.be.reverted;
    //   // await expect(minter.connect(accounts[1]).mint(gauge.address)).to.be
    //   //   .reverted;

    //   await gauge.checkpointTotalSupply();
    //   await gauge.checkpointToken();

    //   // チェックポイントが成功することを確認
    //   await expect(
    //     gauge.connect(accounts[1]).userCheckpoint(accounts[1].address)
    //   ).to.not.be.reverted;

    //   // さらに2週間時間を進める
    //   await time.increase(WEEK.mul(2));

    //   // TODO
    //   // 更新した期間のtokenPerWeekの値を検証
    //   const weekStart = tokenInflationStarts.div(WEEK).mul(WEEK);
    //   for (let i = 1; i < 507; i++) {
    //     // 各週のVotingEscrow残高をVotingEscrowコントラクトから取得し、リワードの理論値を計算する
    //     // WEEK0の途中でロックするのでWEEK0の頭時点ではVE残高は0。WEEK1から計算スタート
    //     const tokenByWeek = await gauge.tokensPerWeek(
    //       weekStart.add(WEEK.mul(i))
    //     );
    //     console.log(`Week ${i} ${tokenByWeek.toString()}`);
    //   }
    // });

    /*
    500週間以上が経過した場合に、最低50週間以内にBobがcheckpointしている場合、Aliceが2回checkpointを呼ぶとAliceの報酬が正しく計算されることを確認
    */
    it("should recover from passing more than 500 weeks", async function () {
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

      // 合計500週間時間を進め、合間にBobがuserCheckpointを実行している場合、
      // TODO Aliceが2回checkpointを呼ぶとAliceの報酬が正しく計算されることを確認
      for (let i = 0; i < 10; i++) {
        await time.increase(WEEK.mul(50));
        await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);
      }
      console.log(
        (await gauge.integrateFraction(accounts[1].address)).toString()
      ); // 0
      await expect(
        gauge.connect(accounts[1]).userCheckpoint(accounts[1].address)
      ).to.not.be.reverted;
      console.log(
        (await gauge.integrateFraction(accounts[1].address)).toString()
      ); // 152746076703070400111392969
      await expect(
        gauge.connect(accounts[1]).userCheckpoint(accounts[1].address)
      ).to.not.be.reverted;
      console.log(
        (await gauge.integrateFraction(accounts[1].address)).toString()
      ); // 159298951968481359010913339

      const currentRate = await token.rate();
      const weekStart = tokenInflationStarts.div(WEEK).mul(WEEK);
      for (let i = 1; i < 500; i++) {
        const tokenByWeek = await gauge.tokensPerWeek(
          weekStart.add(WEEK.mul(i))
        );
        if (i < 52) {
          // 1年目は週間のトークン報酬額が1年目のレートを元に算出されていることを確認
          expect(tokenByWeek).to.be.eq(initialRate.mul(3600 * 24 * 7)); // 1054794520547945205033600
        } else if (i > 469) {
          // 最終週の週間トークン報酬額は最新のレートを元に算出されていることを確認
          expect(tokenByWeek).to.be.eq(currentRate.mul(3600 * 24 * 7)); // 408649008945205477612800
        }

        console.log(`Week ${i} ${tokenByWeek.toString()}`);
      }
    });

    // TODO
    // - 1日ごとに複数回TokenCheckpointしても報酬額は変わらないことを確認
    // - tokenCheckpointだけ複数回してもtimieCursorより先の週の計算はされないこと
    // - 500週放置されても何回もcheckpointをすれば同期完了できることを確認
  });
});
