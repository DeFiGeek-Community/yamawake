import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  RewardGaugeV1,
  MinterV1,
  VotingEscrow,
  YMWK,
  UpgradableGaugeControllerOriginal,
} from "../../../../typechain-types";

type GaugeInfo = {
  contract: RewardGaugeV1;
  type: number;
  weight: bigint;
};
const ACCOUNT_NUM = 5;
const MAX_EXAMPLES = 5;
const STATEFUL_STEP_COUNT = 10;
const DAY = 86400;
const WEEK = DAY * 7;
const YEAR = DAY * 365;
const INFLATION_DELAY = YEAR;

// Helper functions to generate random variables ----->
function randomValue(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}
function getRandomType(): number {
  // Corresponds strategy("decimal", min_value=0, max_value="0.99999999")
  return randomValue(0, 99999999) / 100000000;
}
function getRandomWeight(): bigint {
  // Corresponds strategy("uint", min_value=10 ** 17, max_value=10 ** 19)
  return BigInt(randomValue(10 ** 17, 10 ** 19));
}
// ------------------------------------------------
/* 
FeeDistributorV1のアップグレードテスト
アップグレードテスト用GaugeControllerを仮想のGaugeControllerV2としてアップグレードし、
アップグレードされたGaugeControllerがV1のデータを保持していることを確認。
対応するIntegration testを実行しアップグレードされたGaugeControllerがV1のデータを保持しつつテストをパスすることを確認する
*/
describe("GaugeControllerV1", function () {
  let accounts: SignerWithAddress[];
  let votingEscrow: VotingEscrow;
  let gaugeController: UpgradableGaugeControllerOriginal;
  let token: YMWK;
  let minter: MinterV1;

  let typeWeights: bigint[] = [];
  let gauges: GaugeInfo[] = [];

  let snapshot: SnapshotRestorer;

  beforeEach(async () => {
    snapshot = await takeSnapshot();
    accounts = (await ethers.getSigners()).slice(0, ACCOUNT_NUM);

    const Token = await ethers.getContractFactory("YMWK");
    const Minter = await ethers.getContractFactory("MinterV1");
    const GaugeController =
      await ethers.getContractFactory("GaugeControllerV1");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");

    token = await Token.deploy();
    await token.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken"
    );
    await votingEscrow.waitForDeployment();

    // GaugeControllerV1のデプロイ
    gaugeController = (await upgrades.deployProxy(GaugeController, [
      token.target,
      votingEscrow.target,
    ])) as unknown as UpgradableGaugeControllerOriginal;
    await gaugeController.waitForDeployment();

    minter = (await upgrades.deployProxy(Minter, [
      token.target,
      gaugeController.target,
    ])) as unknown as MinterV1;
    await minter.waitForDeployment();

    typeWeights = [];
    gauges = [];
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  //--------------------------------------------- helper functions -----------------------------------------------------------//

  function _gaugeWeight(idx: number): bigint {
    return gauges.reduce((sum, gauge) => {
      return gauge.type === idx ? sum + gauge.weight : sum;
    }, 0n);
  }

  //--------------------------------------------- Initializer functions -----------------------------------------------------------//
  async function initializeAddType() {
    await ruleAddType();

    // Check
    await checkInvariants();
  }
  //--------------------------------------------- randomly exceuted functions -----------------------------------------------------------//
  async function ruleAddType(stTypeWeight?: bigint) {
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

  async function ruleAddGauge(gaugeType?: number, stGaugeWeight?: bigint) {
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
    const tokenInflationStarts =
      (await token.startEpochTime()) + BigInt(INFLATION_DELAY);
    const Gauge = await ethers.getContractFactory("RewardGaugeV1");
    const gauge = (await upgrades.deployProxy(Gauge, [
      minter.target,
      tokenInflationStarts,
    ])) as unknown as RewardGaugeV1;
    await gauge.waitForDeployment();

    await gaugeController
      .connect(accounts[0])
      .addGauge(gauge.target, gaugeType, stGaugeWeight);

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
      return total + _gaugeWeight(idx) * weight;
    }, 0n);

    expect(await gaugeController.getTotalWeight()).to.be.eq(totalWeight);
  }

  async function invariantRelativeGaugeWeight() {
    // Validate the relative gauge weights.
    await ethers.provider.send("evm_increaseTime", [WEEK]);

    const totalWeight = typeWeights.reduce((total, weight, idx) => {
      return total + _gaugeWeight(idx) * weight;
    }, 0n);

    for (let i = 0; i < gauges.length; i++) {
      await gaugeController
        .connect(accounts[0])
        .checkpointGauge(gauges[i].contract.target);
      const expected =
        (BigInt(1e18) * typeWeights[gauges[i].type] * gauges[i].weight) /
        totalWeight;
      expect(
        await gaugeController.gaugeRelativeWeight(
          gauges[i].contract.target,
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
      return total + _gaugeWeight(idx) * weight;
    }, 0n);
    console.log(`totalWeight: ${totalWeight.toString()}`);

    for (let i = 0; i < gauges.length; i++) {
      console.log(
        `gaugeRelativeWeight(${gauges[i].contract.target}): ${(
          await gaugeController.gaugeRelativeWeight(
            gauges[i].contract.target,
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
      const tokenInflationStarts =
        (await token.startEpochTime()) + BigInt(INFLATION_DELAY);
      const Gauge = await ethers.getContractFactory("RewardGaugeV1");
      const gauge = await upgrades.deployProxy(Gauge, [
        minter.target,
        tokenInflationStarts,
      ]);
      await gauge.waitForDeployment();
      await gaugeController.addGauge(gauge.target, 0, 1);

      // 1) GaugeControllerV2へアップグレード
      const GaugeControllerV2 = await ethers.getContractFactory(
        "UpgradableGaugeControllerOriginal"
      );
      gaugeController = (await upgrades.upgradeProxy(
        gaugeController.target,
        GaugeControllerV2
      )) as unknown as UpgradableGaugeControllerOriginal;
      await gaugeController.waitForDeployment();

      // 2) GaugeControllerV1のデータを保持していることを確認
      expect(await gaugeController.nGaugeTypes()).to.be.eq(1);
      expect(await gaugeController.nGauges()).to.be.eq(1);
      expect(await gaugeController.gauges(0)).to.be.eq(gauge.target);
      expect(await gaugeController.gaugeTypes_(gauge.target)).to.be.eq(1);
    });

    it("should fail to upgrade with non admin user", async () => {
      // 1) Admin以外からGaugeControllerV2へアップグレード
      const GaugeControllerV2 = await ethers.getContractFactory(
        "UpgradableGaugeControllerOriginal",
        accounts[1]
      );

      await expect(
        upgrades.upgradeProxy(gaugeController.target, GaugeControllerV2)
      ).to.be.revertedWith("admin only");
    });

    /* 
    GaugeControllerV2に対し、V2用のIntegration testを実行
    */
    for (let i = 0; i < MAX_EXAMPLES; i++) {
      it(`should upgrade successfully and pass tests for V2 ${i}`, async () => {
        // 1) GaugeControllerV2へアップグレード
        const GaugeControllerV2 = await ethers.getContractFactory(
          "UpgradableGaugeControllerOriginal"
        );
        gaugeController = (await upgrades.upgradeProxy(
          gaugeController.target,
          GaugeControllerV2
        )) as unknown as UpgradableGaugeControllerOriginal;
        await gaugeController.waitForDeployment();

        // 2) V2の機能を使ってTypeWeightを調整
        await gaugeController.changeTypeWeight(0, BigInt(1e18));
        typeWeights.push(BigInt(1e18));

        // 3) V2のテストを実行する
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
