import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  GaugeV1,
  MinterV1,
  VotingEscrow,
  YMWK,
  GaugeControllerV1,
} from "../../../../typechain-types";
import { abs } from "../../../helper";

const NUMBER_OF_ATTEMPTS = 30;
const SCALE = BigInt(1e20);
const DAY = 86400;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365;
const INFLATION_DELAY = YEAR;

/*
複数のアカウントがランダムな額で同期間YMWKをロックし、ロック期間完了後にミントする。
各アカウントのYMWKの残高がロック額の全体に対する割合と対応することを確認
*/
describe("Minter components", function () {
  let accounts: SignerWithAddress[];
  let gaugeController: GaugeControllerV1;
  let gauge: GaugeV1;
  let minter: MinterV1;
  let token: YMWK;
  let votingEscrow: VotingEscrow;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    const Token = await ethers.getContractFactory("YMWK");
    const Minter = await ethers.getContractFactory("MinterV1");
    const Gauge = await ethers.getContractFactory("GaugeV1");
    const GaugeController =
      await ethers.getContractFactory("GaugeControllerV1");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");

    token = await Token.deploy();
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

    await token.setMinter(minter.target);

    await gaugeController.addGauge(gauge.target, 0, ethers.parseEther("10"));
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  function randomBigValue(min: number, max: number) {
    return BigInt(Math.floor(Math.random() * (max - min) + min).toString());
  }

  function approx(value: bigint, target: bigint, tol: bigint) {
    if (value === 0n && target === 0n) {
      return true;
    }

    const diff = abs(value - target);
    const sum = value + target;
    const ratio = (diff * 2n * SCALE) / sum;

    return ratio <= tol;
  }

  for (let i = 0; i < NUMBER_OF_ATTEMPTS; i++) {
    it(`tests amounts ${i}`, async function () {
      let stAmounts: bigint[] = []; //generateUniqueRandomNumbers(3, 1e17, 1e18);
      const depositTime: number[] = [];

      // YMWKトークンを各アカウントへ配布し、VotingEscrowへApprove
      for (let i = 0; i < 3; i++) {
        stAmounts.push(randomBigValue(1e17, 1e18));
        await token.transfer(accounts[i + 1].address, stAmounts[i]);
        await token
          .connect(accounts[i + 1])
          .approve(votingEscrow.target, stAmounts[i]);
      }

      /* 
        1. YMWKインフレーション開始時間 + 1週間まで進め、YMWKのレートを更新する
      */
      const tokenInflationStarts =
        (await token.startEpochTime()) + BigInt(INFLATION_DELAY + WEEK);
      await time.increaseTo(tokenInflationStarts);
      await token.updateMiningParameters();

      /* 
        2. 各アカウントがそれぞれYMWKを4週間ロックする
      */
      const now = await time.latest();
      for (let i = 0; i < 3; i++) {
        await votingEscrow
          .connect(accounts[i + 1])
          .createLock(stAmounts[i], now + WEEK * 4);
        depositTime.push(await time.latest());
      }

      /* 
        3. ロック完了まで時間を進める
      */
      await time.increase(MONTH);

      /* 
        4. それぞれのアカウントでミントし、初期残高との差分を保存する
      */
      const balances: bigint[] = [];
      for (let i = 0; i < 3; i++) {
        await minter.connect(accounts[i + 1]).mint(gauge.target);
        const balanceDiff =
          (await token.balanceOf(accounts[i + 1].address)) - stAmounts[i];
        balances.push(balanceDiff);
      }
      const totalDeposited: bigint = stAmounts.reduce(
        (a: bigint, b: bigint) => a + b,
        0n
      );
      const totalMinted: bigint = balances.reduce(
        (a: bigint, b: bigint) => a + b,
        0n
      );

      console.log(
        `Total deposited: ${totalDeposited.toString()}, Total minted: ${totalMinted.toString()}`
      );
      console.log(
        `Balance 1: ${balances[0]} (${
          (balances[0] * 100n) / totalMinted
        }%) Deposited 1: ${stAmounts[0].toString()} (${
          (stAmounts[0] * 100n) / totalDeposited
        }%)`
      );
      console.log(
        `Balance 2: ${balances[1]} (${
          (balances[1] * 100n) / totalMinted
        }%) Deposited 2: ${stAmounts[1].toString()} (${
          (stAmounts[1] * 100n) / totalDeposited
        }%)`
      );
      console.log(
        `Balance 3: ${balances[2]} (${
          (balances[2] * 100n) / totalMinted
        }%) Deposited 3: ${stAmounts[2].toString()} (${
          (stAmounts[2] * 100n) / totalDeposited
        }%)`
      );

      /* 
        5. YMWK残高増加分の合計値に対する各アカウントの割合が、
        各アカウントがロックしたYMWK額の割合と一致することを確認
      */
      expect(
        approx(
          (balances[0] * SCALE) / totalMinted,
          (stAmounts[0] * SCALE) / totalDeposited,
          BigInt(1e16) // = (10 ** -4) * SCALE
        )
      ).to.be.true;
      expect(
        approx(
          (balances[1] * SCALE) / totalMinted,
          (stAmounts[1] * SCALE) / totalDeposited,
          BigInt(1e16) // = (10 ** -4) * SCALE
        )
      ).to.be.true;
      expect(
        approx(
          (balances[2] * SCALE) / totalMinted,
          (stAmounts[2] * SCALE) / totalDeposited,
          BigInt(1e16) // = (10 ** -4) * SCALE
        )
      ).to.be.true;
    });
  }
});
