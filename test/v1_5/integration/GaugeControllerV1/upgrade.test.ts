import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

type GaugeInfo = {
  contract: Contract;
  type: number;
  weight: BigNumber;
};
const ACCOUNT_NUM = 5;
const MAX_EXAMPLES = 5;
const STATEFUL_STEP_COUNT = 10;
const WEEK = 86400 * 7;

// Helper functions to generate random variables ----->
function randomBigValue(min: number, max: number): BigNumber {
  return BigNumber.from(
    Math.floor(Math.random() * (max - min) + min).toString()
  );
}
function randomValue(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}
function getRandomType(): number {
  // Corresponds strategy("decimal", min_value=0, max_value="0.99999999")
  return randomValue(0, 99999999) / 100000000;
}
function getRandomWeight(): BigNumber {
  // Corresponds strategy("uint", min_value=10 ** 17, max_value=10 ** 19)
  return randomBigValue(10 ** 17, 10 ** 19);
}
// ------------------------------------------------
/* 
FeeDistributorV1のアップグレードテスト
Curveのフォーク版GaugeControllerを仮想のGaugeControllerV2としてアップグレードし、
アップグレードされたGaugeControllerがV1のデータを保持していることを確認。
Curve版のIntegration testを実行しアップグレードされたGaugeControllerがV1のデータを保持しつつテストをパスすることを確認する
*/
describe("GaugeControllerV1", function () {
  let accounts: SignerWithAddress[];
  let votingEscrow: Contract;
  let gaugeController: Contract;
  let token: Contract;
  let minter: Contract;

  let typeWeights: BigNumber[] = [];
  let gauges: GaugeInfo[] = [];

  let snapshot: SnapshotRestorer;

  beforeEach(async () => {
    snapshot = await takeSnapshot();
    accounts = (await ethers.getSigners()).slice(0, ACCOUNT_NUM);

    const Token = await ethers.getContractFactory("YMWK");
    const Minter = await ethers.getContractFactory("Minter");
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

    // GaugeControllerV1のデプロイ
    gaugeController = await upgrades.deployProxy(GaugeController, [
      token.address,
      votingEscrow.address,
    ]);
    await gaugeController.deployed();

    minter = await Minter.deploy(token.address, gaugeController.address);
    await minter.deployed();

    typeWeights = [];
    gauges = [];
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  //--------------------------------------------- helper functions -----------------------------------------------------------//

  function _gaugeWeight(idx: number): BigNumber {
    return gauges.reduce((sum, gauge) => {
      return gauge.type === idx ? sum.add(gauge.weight) : sum;
    }, BigNumber.from("0"));
  }

  //--------------------------------------------- Initializer functions -----------------------------------------------------------//
  async function initializeAddType() {
    await ruleAddType();

    // Check
    await checkInvariants();
  }
  //--------------------------------------------- randomly exceuted functions -----------------------------------------------------------//
  async function ruleAddType(stTypeWeight?: BigNumber) {
    /*
    Add a new gauge type.
    */
    stTypeWeight = stTypeWeight || getRandomWeight();
    await gaugeController.connect(accounts[0]).addType("Type!", stTypeWeight);
    typeWeights.push(stTypeWeight);

    console.log(`ruleAddType --- stTypeWeight: ${stTypeWeight.toString()}`);

    // Check
    await checkInvariants();
  }

  async function ruleAddGauge(gaugeType?: number, stGaugeWeight?: BigNumber) {
    /*
    Add a new gauge.

    If no types have been added, this rule has not effect.
    */
    const stType = getRandomType();
    stGaugeWeight = stGaugeWeight || getRandomWeight();

    if (typeWeights.length === 0) return;

    gaugeType = gaugeType || Math.floor(stType * typeWeights.length);
    console.log(
      `ruleAddGauge --- gaugeType: ${gaugeType}, stGaugeWeight: ${stGaugeWeight.toString()}`
    );
    const LiquidityGauge = await ethers.getContractFactory("Gauge");
    const gauge = await LiquidityGauge.deploy(minter.address);
    await gauge.deployed();

    await gaugeController
      .connect(accounts[0])
      .addGauge(gauge.address, gaugeType, stGaugeWeight);

    gauges.push({ contract: gauge, type: gaugeType, weight: stGaugeWeight });

    // Check
    await checkInvariants();
  }

  async function checkInvariants() {
    await invariantGaugeWeightSums();
    await invariantTotalTypeWeight();
    await invariantRelativeGaugeWeight();
  }

  async function invariantGaugeWeightSums() {
    // Validate the gauge weight sums per type.
    for (let i = 0; i < typeWeights.length; i++) {
      const gaugeWeightSum = _gaugeWeight(i);
      expect(await gaugeController.getWeightsSumPerType(i)).to.be.eq(
        gaugeWeightSum
      );
    }
  }

  async function invariantTotalTypeWeight() {
    // Validate the total weight.
    const totalWeight = typeWeights.reduce((total, weight, idx) => {
      return total.add(_gaugeWeight(idx).mul(weight));
    }, BigNumber.from("0"));

    expect(await gaugeController.getTotalWeight()).to.be.eq(totalWeight);
  }

  async function invariantRelativeGaugeWeight() {
    // Validate the relative gauge weights.
    await ethers.provider.send("evm_increaseTime", [WEEK]);

    const totalWeight = typeWeights.reduce((total, weight, idx) => {
      return total.add(_gaugeWeight(idx).mul(weight));
    }, BigNumber.from("0"));

    for (let i = 0; i < gauges.length; i++) {
      await gaugeController
        .connect(accounts[0])
        .checkpointGauge(gauges[i].contract.address);
      const expected = BigNumber.from("10")
        .pow(18)
        .mul(typeWeights[gauges[i].type])
        .mul(gauges[i].weight)
        .div(totalWeight);
      expect(
        await gaugeController.gaugeRelativeWeight(
          gauges[i].contract.address,
          await time.latest()
        )
      ).to.be.eq(expected);
    }
  }

  async function showStates() {
    console.log("States ------------------------");
    console.log("typeWeights.length: ", typeWeights.length);
    console.log("gauges.length: ", gauges.length);
    for (let i = 0; i < typeWeights.length; i++) {
      console.log(
        `getWeightsSumPerType(${i}): ${(
          await gaugeController.getWeightsSumPerType(i)
        ).toString()}`
      );
    }
    const totalWeight = typeWeights.reduce((total, weight, idx) => {
      return total.add(_gaugeWeight(idx).mul(weight));
    }, BigNumber.from("0"));
    console.log(`totalWeight: ${totalWeight.toString()}`);

    for (let i = 0; i < gauges.length; i++) {
      console.log(
        `gaugeRelativeWeight(${gauges[i].contract.address}): ${(
          await gaugeController.gaugeRelativeWeight(
            gauges[i].contract.address,
            await time.latest()
          )
        ).toString()}`
      );
    }
    console.log("------------------------");
  }

  let func = [ruleAddType, ruleAddGauge];

  describe("Upgrade to GaugeControllerV2", function () {
    // アップグレードされたGaugeControllerがV1のデータを保持していることを確認する
    it(`should upgrade successfully and keep variables`, async () => {
      // Gaugeの追加
      const LiquidityGauge = await ethers.getContractFactory("Gauge");
      const gauge = await LiquidityGauge.deploy(minter.address);
      await gauge.deployed();
      await gaugeController.addGauge(gauge.address, 0, 1);

      // 1) GaugeControllerV2へアップグレード
      const GaugeControllerV2 = await ethers.getContractFactory(
        "UpgradableGaugeControllerOriginal"
      );
      gaugeController = await upgrades.upgradeProxy(
        gaugeController.address,
        GaugeControllerV2
      );
      await gaugeController.deployed();

      // 2) GaugeControllerV1のデータを保持していることを確認
      expect(await gaugeController.nGaugeTypes()).to.be.eq(1);
      expect(await gaugeController.nGauges()).to.be.eq(1);
      expect(await gaugeController.gauges(0)).to.be.eq(gauge.address);
      expect(await gaugeController.gaugeTypes_(gauge.address)).to.be.eq(1);
    });

    it("should fail to upgrade with non admin user", async () => {
      // 1) Admin以外からGaugeControllerV2へアップグレード
      const GaugeControllerV2 = await ethers.getContractFactory(
        "UpgradableGaugeControllerOriginal",
        accounts[1]
      );

      await expect(
        upgrades.upgradeProxy(gaugeController.address, GaugeControllerV2)
      ).to.be.revertedWith("admin only");
    });

    /* 
    GaugeControllerV2に対し、Curve版のIntegration testを実行
    */
    for (let i = 0; i < MAX_EXAMPLES; i++) {
      it(`should upgrade successfully and pass tests for V2 ${i}`, async () => {
        // 1) GaugeControllerV2へアップグレード
        const GaugeControllerV2 = await ethers.getContractFactory(
          "UpgradableGaugeControllerOriginal"
        );
        gaugeController = await upgrades.upgradeProxy(
          gaugeController.address,
          GaugeControllerV2
        );
        await gaugeController.deployed();

        // 2) Curve版の機能を使ってTypeWeightを調整
        await gaugeController.changeTypeWeight(0, BigNumber.from(10).pow(18));
        typeWeights.push(BigNumber.from(BigNumber.from(10).pow(18)));

        // 3) Curve版のテストを実行する
        const steps = randomValue(1, STATEFUL_STEP_COUNT);
        for (let x = 0; x < steps; x++) {
          let n = randomValue(0, func.length);
          await func[n]();
        }

        // await showStates();
      });
    }
  });
});
