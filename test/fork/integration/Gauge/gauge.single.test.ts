import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import Constants from "../../Constants";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// Helper functions to generate random variables ----->
function randomBigValue(min: number, max: number): BigNumber {
  return BigNumber.from(
    Math.floor(Math.random() * (max - min) + min).toString()
  );
}
function randomValue(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}
function getRandomWeeks(): BigNumber {
  return randomBigValue(1, 208);
}
function getRandomTime(): BigNumber {
  return randomBigValue(0, 86400 * 3);
}
// <-----
describe("LiquidityGauge", function () {
  let accounts: SignerWithAddress[];
  let factory: Contract;
  let gaugeController: Contract;
  let token: Contract;
  let votingEscrow: Contract;
  let mockLpToken: Contract;
  let gauge: Contract;
  let minter: Contract;

  let snapshot: SnapshotRestorer;
  const ten_to_the_18 = Constants.ten_to_the_18;
  const ten_to_the_20 = Constants.ten_to_the_20;
  const ten_to_the_21 = Constants.ten_to_the_21;
  const MAX_UINT256 = Constants.MAX_UINT256;
  const zero = Constants.zero;
  const WEEK = Constants.WEEK;

  const SCALE = BigNumber.from(10).pow(20);
  const DAY = 86400;
  const YEAR = DAY * 365;
  const INFLATION_DELAY = YEAR;

  beforeEach(async () => {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();

    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const Factory = await ethers.getContractFactory("Factory");
    const GaugeController = await ethers.getContractFactory("GaugeController");
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

    gaugeController = await GaugeController.deploy(
      token.address,
      votingEscrow.address
    );
    await gaugeController.deployed();

    minter = await Minter.deploy(token.address, gaugeController.address);
    await minter.deployed();

    gauge = await Gauge.deploy(minter.address);
    await gauge.deployed();

    await gaugeController.addType("none", 0);
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  function approx(value: BigNumber, target: BigNumber, tol: BigNumber) {
    if (value.isZero() && target.isZero()) {
      return true;
    }

    const diff = value.sub(target).abs();
    const sum = value.add(target);
    const ratio = diff.mul(2).mul(BigNumber.from(SCALE)).div(sum);

    console.log(
      `Value: ${value.toString()}, Target: ${target.toString()}, Tol: ${tol.toString()}`
    );
    console.log(
      `Diff: ${diff.toString()}, Sum: ${sum.toString()}, Ratio: ${ratio.toString()}`
    );

    return ratio.lte(tol);
  }

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
      // タイプの追加とその重みの変更
      await gaugeController.addType("Liquidity", 0);
      await gaugeController.changeTypeWeight(1, BigNumber.from(10).pow(18));
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
      const timeCursor = await gauge.timeCursor();
      await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);

      /* 
        5. 理論値と実績値の計算し、VotingEscrowから取得したveバランスとgaugeから取得したveバランスの履歴が等しいことを確認
      */
      // 期間中のYMWKリワード理論値
      const theoreticalTokenTotal = timeCursor
        .sub(weekStart)
        .sub(WEEK.mul(2))
        .mul(initialRate);
      // ゲージに記録されたのYMWKリワード実績値
      let tokenByWeekTotal = BigNumber.from("0");
      // VotingEscrowから取得した値を元に計算するAliceのYMWKリワード理論値
      let expectedAliceReward = BigNumber.from("0");
      // VotingEscrowから取得した値を元に計算するBobのYMWKリワード理論値
      let expectedBobReward = BigNumber.from("0");
      for (let i = 1; i < 52; i++) {
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
    });

    /*
    20週間以上が経過した場合に状態を最新の状態に同期することができることを確認
    */
    it("should recover from passing more than 20 weeks", async function () {
      // タイプの追加とその重みの変更
      await gaugeController.addType("Liquidity", 0);
      await gaugeController.changeTypeWeight(1, BigNumber.from(10).pow(18));
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

      // 21週間時間を進める
      await time.increase(WEEK.mul(25));

      // zero division error
      expect(gauge.connect(accounts[1]).userCheckpoint(accounts[1].address)).to
        .be.reverted;

      await gauge.checkpointTotalSupply();
      await gauge.checkpointToken();

      // チェックポイントが成功することを確認
      expect(gauge.connect(accounts[1]).userCheckpoint(accounts[1].address)).to
        .not.be.reverted;
    });
  });

  //   describe("Gauge Integral Calculations", function () {
  //     /**
  //      * テスト: test_gauge_integral
  //      * 1. AliceとBobの保有量と積分の初期化を行う。
  //      * 2. 現在のブロックのタイムスタンプと初期レートを取得する。
  //      * 3. タイプを追加し、その重みを変更する。
  //      * 4. LPトークンをAliceとBobに均等に送信する。
  //      * 5. 積分の更新処理を行うための補助関数「update_integral」を定義する。
  //      * 6. Bobが預金または引き出しを繰り返し行い、Aliceがそれをランダムに行う10回のループを開始する。
  //      *    a. ランダムな時間を週単位で経過させるシミュレーションを行う。
  //      *    b. Bobがランダムに預金または引き出しを行う。
  //      *    c. 20%の確率でAliceも預金または引き出しを行う。
  //      *    d. 同じ秒数でのユーザーチェックポイントの更新が影響しないことを確認する。
  //      *    e. AliceとBobの保有量が正しいことを確認する。
  //      *    f. もう一度、ランダムな時間を経過させるシミュレーションを行う。
  //      *    g. Aliceのユーザーチェックポイントを更新し、積分を更新する。
  //      * 7. テストが終了する。
  //      */
  //     it("should correctly calculate user integrals over randomized actions", async () => {
  //       await time.increase(INFLATION_DELAY);

  //       // AliceとBobの保有量と積分を初期化
  //       let alice_locked = BigNumber.from("0");
  //       let alice_locked_until = 0;
  //       let bob_locked = BigNumber.from("0");
  //       let bob_locked_until = 0;
  //       let integral = BigNumber.from("0");

  //       // 最新のブロックのタイムスタンプを取得
  //       let checkpoint = BigNumber.from(await time.latest());
  //       // 初期レートの取得
  //       let checkpoint_rate: BigNumber = await token.rate();
  //       let checkpoint_supply = BigNumber.from("0");
  //       let checkpoint_balance = BigNumber.from("0");

  //       // タイプの追加とその重みの変更
  //       await gaugeController.addType("Liquidity", 0);
  //       await gaugeController.changeTypeWeight(1, BigNumber.from(10).pow(18));
  //       await gaugeController.addGauge(
  //         gauge.address,
  //         1,
  //         BigNumber.from(10).pow(18)
  //       );

  //       // YMWKトークンを送信
  //       const creatorBalance = await token.balanceOf(accounts[0].address);
  //       await token.transfer(accounts[1].address, creatorBalance.div(2));
  //       await token.transfer(accounts[2].address, creatorBalance.div(2));

  //       // 積分を更新する関数
  //       async function update_integral() {
  //         let timeCursor = await gauge.timeCursor();
  //         let t1 = BigNumber.from(await time.latest());
  //         let weekCursorEnd = checkpoint.div(WEEK).mul(WEEK);

  //         let rate1 = await token.rate();
  //         let t_epoch = await token.startEpochTime();
  //         let rate_x_time = BigNumber.from("0");

  //         while (weekCursorEnd.lt(t1)) {
  //           let weekCursor = weekCursorEnd.sub(WEEK);

  //           if (weekCursorEnd.gte(t_epoch)) {
  //             // 対象の週がepochをまたいでいる場合は旧レート、新レートでそれぞれ計算
  //             rate_x_time = t_epoch
  //               .sub(weekCursor)
  //               .mul(checkpoint_rate)
  //               .add(weekCursorEnd.sub(t_epoch).mul(rate1));
  //           } else {
  //             rate_x_time = weekCursorEnd.sub(weekCursor).mul(checkpoint_rate);
  //           }
  //           checkpoint_supply = await gauge.veSupply(weekCursorEnd);
  //           checkpoint_balance = await gauge.veForAt(
  //             accounts[1].address,
  //             weekCursorEnd
  //           );

  //           // checkpoint_supply > 0
  //           if (checkpoint_supply.gt(BigNumber.from("0"))) {
  //             // integral + rate_x_time * checkpoint_balance / checkpoint_supply
  //             integral = integral.add(
  //               rate_x_time.mul(checkpoint_balance).div(checkpoint_supply)
  //             );
  //           }
  //           checkpoint_rate = rate1;
  //           checkpoint = t1;

  //           console.log(
  //             `weekCursor: ${weekCursor.toString()}, ${weekCursorEnd.toString()} veSupply: ${checkpoint_supply}, ve alice: ${checkpoint_balance}, ve bob: ${(
  //               await gauge.veForAt(accounts[2].address, weekCursorEnd)
  //             ).toString()}`
  //           );

  //           weekCursorEnd = weekCursorEnd.add(WEEK);
  //         }
  //       }

  //       // Bobは常に預金または引き出しを行い、Aliceはそれをあまり行わない
  //       for (let i = 0; i < 1; i++) {
  //         // let is_alice = Math.random() < 0.2;
  //         let is_alice = Math.random() < 0.5;

  //         // ランダムな時間経過をシミュレート
  //         let dt = Math.floor(Math.random() * 86400 * 73) + 1;
  //         await ethers.provider.send("evm_increaseTime", [dt]);

  //         // Bobの処理
  //         let is_withdraw = i > 0 && Math.random() < 0.5;

  //         // if (is_withdraw) {
  //         //   // 引き出し処理
  //         //   let amount = (await votingEscrow.locked(accounts[2].address)).amount;
  //         //   await votingEscrow.connect(accounts[2]).withdraw();
  //         //   await update_integral();
  //         //   bob_locked = bob_locked.sub(amount);
  //         //   bob_locked_until = 0;
  //         // } else {
  //         // 預金処理
  //         let amount = BigNumber.from(
  //           Math.floor(Math.random() * 10000).toString()
  //         )
  //           .mul(await token.balanceOf(accounts[2].address))
  //           .div(BigNumber.from("10"))
  //           .div(BigNumber.from("10000"));
  //         let duration = WEEK.mul(2).toNumber(); // TODO RANDAMIZE!
  //         await token.connect(accounts[2]).approve(votingEscrow.address, amount);
  //         if (bob_locked.eq(0)) {
  //           const lockedUntil =
  //             Math.floor((await time.latest()) / WEEK.toNumber()) *
  //               WEEK.toNumber() +
  //             duration;
  //           await votingEscrow
  //             .connect(accounts[2])
  //             .createLock(amount, lockedUntil);
  //           bob_locked = bob_locked.add(amount);

  //           console.log(
  //             `Bob locked ${amount.toString()} for ${Math.floor(
  //               duration / WEEK.toNumber()
  //             )}`
  //           );
  //         } else if (bob_locked_until < (await time.latestBlock())) {
  //           // await votingEscrow
  //           //   .connect(accounts[2])
  //           //   .increaseUnlockTime(duration);
  //           // bob_locked_until += duration;

  //           // 引き出し処理
  //           amount = (await votingEscrow.locked(accounts[2].address)).amount;
  //           await votingEscrow.connect(accounts[2]).withdraw();

  //           bob_locked = bob_locked.sub(amount);
  //           bob_locked_until = 0;

  //           console.log(`Bob withdrawn ${amount.toString()}`);
  //         } else if (bob_locked.gt(0)) {
  //           await votingEscrow.connect(accounts[2]).increaseAmount(amount);
  //           bob_locked = bob_locked.add(amount);

  //           console.log(
  //             `Bob increased Amount ${amount.toString()} remianing: ${bob_locked_until}`
  //           );
  //         }

  //         await update_integral();
  //         // }

  //         // Aliceの処理
  //         if (is_alice) {
  //           //   let is_withdraw_alice =
  //           //     (await gauge.balanceOf(accounts[1].address)) > 0 &&
  //           //     Math.random() > 0.5;
  //           //   if (is_withdraw_alice) {
  //           // // 引き出し処理
  //           // let amount_alice = (await votingEscrow.locked(accounts[1].address))
  //           //   .amount;
  //           // await votingEscrow.connect(accounts[1]).withdraw();
  //           // await update_integral();
  //           // alice_locked = alice_locked.sub(amount_alice);
  //           // alice_locked_until = 0;
  //           //   } else {
  //           // 預金処理
  //           let amount_alice = BigNumber.from(
  //             Math.floor(Math.random() * 10000).toString()
  //           )
  //             .mul(await token.balanceOf(accounts[1].address))
  //             .div(BigNumber.from("10000"));
  //           let duration = WEEK.mul(2).toNumber(); // TODO RANDAMIZE!
  //           await token
  //             .connect(accounts[1])
  //             .approve(votingEscrow.address, amount_alice);
  //           if (alice_locked.eq(0)) {
  //             const lockedUntil =
  //               Math.floor((await time.latest()) / WEEK.toNumber()) *
  //                 WEEK.toNumber() +
  //               duration;
  //             await votingEscrow
  //               .connect(accounts[1])
  //               .createLock(amount_alice, lockedUntil);
  //             alice_locked = alice_locked.add(amount_alice);
  //             console.log(
  //               `Alice locked ${amount.toString()} for ${Math.floor(
  //                 duration / WEEK.toNumber()
  //               )}`
  //             );
  //           } else if (alice_locked_until < (await time.latestBlock())) {
  //             //   await votingEscrow
  //             //     .connect(accounts[1])
  //             //     .increaseUnlockTime(duration);
  //             //   alice_locked_until += duration;

  //             // 引き出し処理
  //             let amount_alice = (await votingEscrow.locked(accounts[1].address))
  //               .amount;
  //             await votingEscrow.connect(accounts[1]).withdraw();

  //             alice_locked = alice_locked.sub(amount_alice);
  //             alice_locked_until = 0;
  //             console.log(`Alice withdrawn ${amount.toString()} `);
  //           } else if (alice_locked.gt(0)) {
  //             await votingEscrow
  //               .connect(accounts[1])
  //               .increaseAmount(amount_alice);
  //             alice_locked = alice_locked.add(amount_alice);
  //             console.log(`Alice increased amount ${amount.toString()} `);
  //           }
  //           await update_integral();
  //           //   }
  //         }

  //         // 同じ秒数でのチェックポイントの更新は影響しないことの確認
  //         if (Math.random() < 0.5) {
  //           await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
  //         }
  //         if (Math.random() < 0.5) {
  //           await gauge.connect(accounts[2]).userCheckpoint(accounts[2].address);
  //         }

  //         // 保有量の確認（ = veなので削除）
  //         // expect(await gauge.balanceOf(accounts[1].address)).to.equal(
  //         //   alice_locked
  //         // );
  //         // expect(await gauge.balanceOf(accounts[2].address)).to.equal(bob_locked);
  //         // expect(await gauge.totalSupply()).to.equal(
  //         //   alice_locked.add(bob_locked)
  //         // );

  //         // ランダムな時間経過をさらにシミュレート
  //         dt = Math.floor(Math.random() * 86400 * 19) + 1;
  //         await ethers.provider.send("evm_increaseTime", [dt]);

  //         await gauge.connect(accounts[1]).userCheckpoint(accounts[1].address);
  //         await update_integral();

  //         // TODO Check integral is approx. equal to gauge.integrateFraction(alice)
  //         // expect(await gauge.integrateFraction(accounts[1].address)).to.be.eq(
  //         //   integral
  //         // );

  //         console.log(
  //           (await gauge.integrateFraction(accounts[1].address)).toString(),
  //           (await gauge.integrateFraction(accounts[2].address)).toString(),
  //           integral.toString()
  //         );
  //       }
  //     });
  //   });

  /**
   * test_mining_with_votelock の全体的な流れ:
   *
   * 1. 2週間と5秒の時間を進める。
   * 2. ゲージとコントローラーをセットアップし、適切なレートを設定する。
   * 3. AliceとBobにトークンを転送し、それぞれのアドレスに関連する承認を設定する。
   * 4. Aliceは投票のエスクローにトークンをロックすることで、BOOSTを取得する。
   * 5. AliceとBobはそれぞれ流動性をデポジットする。
   * 6. Aliceの投票ロックの存在とBobの投票ロックの不在を確認する。
   * 7. 時間をさらに進め、両方のユーザーのチェックポイントを更新する。
   * 8. 4週間後、AliceとBobの投票エスクローのバランスが0であることを確認する。
   * 9. Aliceが投票ロックでTokenを獲得したため、彼女はBobの2.5倍のリワードを獲得することを確認する。
   * 10. さらに時間を進め、両方のユーザーのチェックポイントを更新する。
   * 11. 最終的に、AliceとBobが同じ量のリワードを獲得していることを確認する。
   */
  // describe("Mining with Vote Locking", function () {
  //   it("should distribute rewards according to vote lock status", async () => {
  //     // 2週間と5秒時間を進める
  //     await ethers.provider.send("evm_increaseTime", [
  //       WEEK.mul(BigNumber.from("2")).add(BigNumber.from("5")).toNumber(),
  //     ]);

  //     // ゲージをコントローラーに接続して適切なレートなどを設定する
  //     await gaugeController.addType("Liquidity", 0);
  //     await gaugeController.changeTypeWeight(1, ten_to_the_18);
  //     await gaugeController.addGauge(threeGauges[0], 1, ten_to_the_18);

  //     // トークンの準備
  //     await token.transfer(accounts[1].address, ten_to_the_20);
  //     await token.transfer(accounts[2].address, ten_to_the_20);

  //     await token
  //       .connect(accounts[1])
  //       .approve(votingEscrow.address, MAX_UINT256);
  //     await token
  //       .connect(accounts[2])
  //       .approve(votingEscrow.address, MAX_UINT256);
  //     const creatorBalance = await mockLpToken.balanceOf(accounts[0].address);
  //     await mockLpToken.transfer(
  //       accounts[1].address,
  //       creatorBalance.div(BigNumber.from("2"))
  //     );
  //     await mockLpToken.transfer(
  //       accounts[2].address,
  //       creatorBalance.div(BigNumber.from("2"))
  //     );

  //     await mockLpToken
  //       .connect(accounts[1])
  //       .approve(threeGauges[0], MAX_UINT256);
  //     await mockLpToken
  //       .connect(accounts[2])
  //       .approve(threeGauges[0], MAX_UINT256);

  //     // Aliceがescrowにデポジットする。AliceはBOOSTを持っていることになる
  //     let t = BigNumber.from(
  //       (await ethers.provider.getBlock("latest")).timestamp
  //     );

  //     await votingEscrow
  //       .connect(accounts[1])
  //       .createLock(ten_to_the_20, t.add(WEEK.mul(BigNumber.from("2"))));

  //     // AliceとBobが一部の流動性をデポジットする
  //     await gauges[0]
  //       .connect(accounts[1])
  //       .deposit(ten_to_the_21, accounts[1].address, false);
  //     await gauges[0]
  //       .connect(accounts[2])
  //       .deposit(ten_to_the_21, accounts[2].address, false);
  //     let now = BigNumber.from(
  //       (await ethers.provider.getBlock("latest")).timestamp
  //     );

  //     // 現在、Aliceは投票ロックを持っているが、Bobは持っていないことを確認する
  //     expect(
  //       await votingEscrow["balanceOf(address,uint256)"](
  //         accounts[1].address,
  //         now
  //       )
  //     ).to.not.equal(zero);
  //     expect(
  //       await votingEscrow["balanceOf(address,uint256)"](
  //         accounts[2].address,
  //         now
  //       )
  //     ).to.equal(zero);

  //     // 時間を進めてチェックポイントを更新する
  //     now = BigNumber.from(
  //       (await ethers.provider.getBlock("latest")).timestamp
  //     );
  //     await ethers.provider.send("evm_setNextBlockTimestamp", [
  //       now.add(WEEK.mul(BigNumber.from("4"))).toNumber(),
  //     ]);

  //     // チェックポイント更新
  //     await ethers.provider.send("evm_setAutomine", [false]);
  //     await gauges[0].connect(accounts[2]).userCheckpoint(accounts[2].address);
  //     await gauges[0].connect(accounts[1]).userCheckpoint(accounts[1].address);
  //     await ethers.provider.send("evm_mine", []);
  //     await ethers.provider.send("evm_setAutomine", [true]);

  //     // 4週間後、balanceOfは0であるべき
  //     now = BigNumber.from(
  //       (await ethers.provider.getBlock("latest")).timestamp
  //     );
  //     expect(
  //       await votingEscrow["balanceOf(address,uint256)"](
  //         accounts[1].address,
  //         now
  //       )
  //     ).to.equal(zero);
  //     expect(
  //       await votingEscrow["balanceOf(address,uint256)"](
  //         accounts[2].address,
  //         now
  //       )
  //     ).to.equal(zero);

  //     // AliceはTokenを投票ロックしたので、2.5倍のTokenを獲得
  //     let rewards_alice = await gauges[0].integrateFraction(
  //       accounts[1].address
  //     );
  //     let rewards_bob = await gauges[0].integrateFraction(accounts[2].address);
  //     expect(
  //       rewards_alice.mul(BigNumber.from("10000000000000000")).div(rewards_bob)
  //     ).to.equal(BigNumber.from("25000000000000000"));

  //     // 時間を進めてチェックポイントを更新: 今は誰もがTokenを投票ロックしていない
  //     now = BigNumber.from(
  //       (await ethers.provider.getBlock("latest")).timestamp
  //     );
  //     await ethers.provider.send("evm_setNextBlockTimestamp", [
  //       now.add(WEEK.mul(BigNumber.from("4"))).toNumber(),
  //     ]);

  //     await ethers.provider.send("evm_setAutomine", [false]);
  //     await gauges[0].connect(accounts[2]).userCheckpoint(accounts[2].address);
  //     await gauges[0].connect(accounts[1]).userCheckpoint(accounts[1].address);
  //     await ethers.provider.send("evm_mine", []);
  //     await ethers.provider.send("evm_setAutomine", [true]);
  //     let old_rewards_alice = rewards_alice;
  //     let old_rewards_bob = rewards_bob;
  //     // 今、AliceはBobと同じ量を獲得した
  //     rewards_alice = await gauges[0].integrateFraction(accounts[1].address);
  //     rewards_bob = await gauges[0].integrateFraction(accounts[2].address);
  //     console.log(rewards_alice);
  //     console.log(rewards_bob);
  //     let d_alice = rewards_alice.sub(old_rewards_alice);
  //     let d_bob = rewards_bob.sub(old_rewards_bob);

  //     expect(d_alice.sub(d_bob)).to.equal(zero);
  //   });
  // });
});
