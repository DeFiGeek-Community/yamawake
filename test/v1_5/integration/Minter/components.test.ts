import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

const NUMBER_OF_ATTEMPTS = 30;
const SCALE = BigNumber.from((1e20).toString());
const DAY = 86400;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365;
const INFLATION_DELAY = YEAR;

describe("Minter components", function () {
  let accounts: SignerWithAddress[];
  let gaugeController: Contract;
  let gauge: Contract;
  let minter: Contract;
  let token: Contract;
  let votingEscrow: Contract;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    const Token = await ethers.getContractFactory("YMWK");
    const Minter = await ethers.getContractFactory("Minter");
    const Gauge = await ethers.getContractFactory("Gauge");
    const GaugeController = await ethers.getContractFactory(
      "GaugeControllerV1"
    );
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");

    token = await Token.deploy();
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

    await token.setMinter(minter.address);

    await gaugeController.addGauge(
      gauge.address,
      0,
      ethers.utils.parseEther("10")
    );
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  function randomBigValue(min: number, max: number): BigNumber {
    return BigNumber.from(
      Math.floor(Math.random() * (max - min) + min).toString()
    );
  }

  function approx(value: BigNumber, target: BigNumber, tol: BigNumber) {
    if (value.isZero() && target.isZero()) {
      return true;
    }

    const diff = value.sub(target).abs();
    const sum = value.add(target);
    const ratio = diff.mul(2).mul(SCALE).div(sum);

    return ratio.lte(tol);
  }

  async function showGaugeInfo() {
    console.log("Gauge info----");
    console.log(
      "GaugeWeight: ",
      (await gaugeController.getGaugeWeight(gauge.address)).toString()
    );
    console.log(
      "TypeWeight: ",
      (await gaugeController.getTypeWeight(0)).toString()
    );
    console.log(
      "TotalWeight: ",
      (await gaugeController.getTotalWeight()).toString()
    );
    console.log(
      "TypeWeightSum: ",
      (await gaugeController.getWeightsSumPerType(0)).toString()
    );
    console.log("TimeTotal: ", (await gaugeController.timeTotal()).toString());
    console.log(
      "pointsTotal: ",
      (
        await gaugeController.pointsTotal(
          (await gaugeController.timeTotal()).toString()
        )
      ).toString()
    );
    console.log(
      "gaugeRelativeWeight: ",
      (
        await gaugeController.gaugeRelativeWeight(
          gauge.address,
          await time.latest()
        )
      ).toString()
    );
    console.log("TotalSupply: ", (await gauge.totalSupply()).toString());
    console.log("----");
  }

  for (let i = 0; i < NUMBER_OF_ATTEMPTS; i++) {
    it(`tests amounts ${i}`, async function () {
      /*
      複数のアカウントがランダムな額で同期間YMWKをロックし、ロック期間完了後にミントする。
      各アカウントのYMWKの残高がロック額と対応することを確認
      */
      let stAmounts: BigNumber[] = []; //generateUniqueRandomNumbers(3, 1e17, 1e18);
      const depositTime: number[] = [];

      // YMWKトークンを各アカウントへ配布し、VotingEscrowへApprove
      for (let i = 0; i < 3; i++) {
        stAmounts.push(randomBigValue(1e17, 1e18));
        await token.transfer(accounts[i + 1].address, stAmounts[i]);
        await token
          .connect(accounts[i + 1])
          .approve(votingEscrow.address, stAmounts[i]);
      }

      /* 
        1. YMWKインフレーション開始時間 + 1週間まで進め、YMWKのレートを更新する
      */
      const tokenInflationStarts: BigNumber = (
        await token.startEpochTime()
      ).add(INFLATION_DELAY + WEEK);
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
      const balances: BigNumber[] = [];
      for (let i = 0; i < 3; i++) {
        await minter.connect(accounts[i + 1]).mint(gauge.address);
        const balanceDiff = (
          await token.balanceOf(accounts[i + 1].address)
        ).sub(stAmounts[i]);
        balances.push(balanceDiff);
      }
      const totalDeposited: BigNumber = stAmounts.reduce(
        (a: BigNumber, b: BigNumber) => a.add(b),
        ethers.BigNumber.from(0)
      );
      const totalMinted: BigNumber = balances.reduce(
        (a: BigNumber, b: BigNumber) => a.add(b),
        ethers.BigNumber.from(0)
      );

      console.log(
        `Total deposited: ${totalDeposited.toString()}, Total minted: ${totalMinted.toString()}`
      );
      console.log(
        `Balance 1: ${balances[0]} (${balances[0]
          .mul(100)
          .div(
            totalMinted
          )}%) Deposited 1: ${stAmounts[0].toString()} (${stAmounts[0]
          .mul(100)
          .div(totalDeposited)}%)`
      );
      console.log(
        `Balance 2: ${balances[1]} (${balances[1]
          .mul(100)
          .div(
            totalMinted
          )}%) Deposited 2: ${stAmounts[1].toString()} (${stAmounts[1]
          .mul(100)
          .div(totalDeposited)}%)`
      );
      console.log(
        `Balance 3: ${balances[2]} (${balances[2]
          .mul(100)
          .div(
            totalMinted
          )}%) Deposited 3: ${stAmounts[2].toString()} (${stAmounts[2]
          .mul(100)
          .div(totalDeposited)}%)`
      );

      /* 
        5. YMWK残高増加分の合計値に対する各アカウントの割合が、
        各アカウントがロックしたYMWK額の割合と一致することを確認
      */
      expect(
        approx(
          balances[0].mul(SCALE).div(totalMinted),
          BigNumber.from(stAmounts[0].toString())
            .mul(SCALE)
            .div(totalDeposited.toString()),
          BigNumber.from(10).pow(16) // = (10 ** -4) * SCALE
        )
      ).to.be.true;
      expect(
        approx(
          balances[1].mul(SCALE).div(totalMinted),
          BigNumber.from(stAmounts[1].toString())
            .mul(SCALE)
            .div(totalDeposited.toString()),
          BigNumber.from(10).pow(16) // = (10 ** -4) * SCALE
        )
      ).to.be.true;
      expect(
        approx(
          balances[2].mul(SCALE).div(totalMinted),
          BigNumber.from(stAmounts[2].toString())
            .mul(SCALE)
            .div(totalDeposited.toString()),
          BigNumber.from(10).pow(16) // = (10 ** -4) * SCALE
        )
      ).to.be.true;
    });
  }
});
