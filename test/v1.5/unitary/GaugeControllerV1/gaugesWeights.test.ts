import { ethers, upgrades } from "hardhat";
import { AddressLike } from "ethers";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import Constants from "../../../lib/Constants";
import { GaugeControllerV1 } from "../../../../typechain-types";

describe("GaugeControllerV1", function () {
  let accounts: SignerWithAddress[];
  let gaugeController: GaugeControllerV1;
  let threeGauges: AddressLike[];
  let snapshot: SnapshotRestorer;

  const GAUGE_WEIGHTS = Constants.GAUGE_WEIGHTS;
  const WEIGHT = BigInt(1e18);
  const DAY = 86400;
  const YEAR = DAY * 365;
  const INFLATION_DELAY = YEAR;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    // Contract factories
    const Token = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const GaugeController =
      await ethers.getContractFactory("GaugeControllerV1");
    const Minter = await ethers.getContractFactory("Minter");

    // Contract deployments
    const token = await Token.deploy();
    const votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    gaugeController = (await upgrades.deployProxy(GaugeController, [
      token.target,
      votingEscrow.target,
    ])) as unknown as GaugeControllerV1;

    const minter = await Minter.deploy(token.target, gaugeController.target);

    const tokenInflationStarts =
      (await token.startEpochTime()) + BigInt(INFLATION_DELAY);
    const LiquidityGauge = await ethers.getContractFactory("Gauge");
    const lg1 = await LiquidityGauge.deploy(
      minter.target,
      tokenInflationStarts
    );
    threeGauges = [lg1.target, lg1.target, lg1.target];
  });

  afterEach(async () => {
    await snapshot.restore();
  });
  describe("GaugeController GaugesWeights", function () {
    /*
    複数のGaugeの追加ができないことを確認
    */
    it("test_add_gauges", async function () {
      await gaugeController.addGauge(
        threeGauges[0],
        0,
        GAUGE_WEIGHTS[0].toString()
      );
      await expect(
        gaugeController.addGauge(threeGauges[1], 0, GAUGE_WEIGHTS[0].toString())
      ).to.be.revertedWith("Only veYMWK Gauge can be added for V1");
    });

    /*
    Gauge追加前にnGaugesが0であること、Gauge追加後にnGaugesが1になることを確認
    */
    it("test_n_gauges", async function () {
      expect(await gaugeController.nGauges()).to.equal(0);

      await gaugeController.addGauge(
        threeGauges[0],
        0,
        GAUGE_WEIGHTS[0].toString()
      );

      expect(await gaugeController.nGauges()).to.equal(1);
    });

    /*
    同じGaugeを追加しようとしても、1つしか登録できない旨のエラーを返すことを確認
    */
    it("test_n_gauges_same_gauge", async function () {
      await gaugeController.addGauge(
        threeGauges[0],
        0,
        GAUGE_WEIGHTS[0].toString()
      );
      await expect(
        gaugeController.addGauge(threeGauges[0], 0, GAUGE_WEIGHTS[0].toString())
      ).to.be.revertedWith("Only veYMWK Gauge can be added for V1");
    });

    /*
    デプロイ後の状態でgaugeTypeが1つ追加されていることを確認
    */
    it("test_n_gauge_types", async function () {
      expect(await gaugeController.nGaugeTypes()).to.equal(1);
    });

    /*
    gaugeRelativeWeight(相対Weight)は引数に関わらず固定値1e18を返却することを確認
    */
    it("test_gauge_types", async function () {
      await gaugeController.addGauge(
        threeGauges[0],
        0,
        GAUGE_WEIGHTS[0].toString()
      );
      expect(await gaugeController.gaugeTypes(threeGauges[0])).to.equal(0);
    });

    /*
    gaugeRelativeWeight(相対Weight)は引数に関わらず固定値1e18を返却することを確認
    */
    it("test_relative_weight", async function () {
      await gaugeController.addGauge(
        threeGauges[0],
        0,
        GAUGE_WEIGHTS[0].toString()
      );

      const relativeWeight1 = await gaugeController.gaugeRelativeWeight(
        threeGauges[0],
        0
      );
      const relativeWeight2 = await gaugeController.gaugeRelativeWeight(
        ethers.ZeroAddress,
        184681 // Just a random number
      );
      expect(relativeWeight1).to.be.eq(WEIGHT);
      expect(relativeWeight2).to.be.eq(WEIGHT);
    });
  });
});
