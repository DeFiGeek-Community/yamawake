import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import Constants from "../../Constants";

describe("GaugeController", function () {
  let accounts: SignerWithAddress[];
  let gaugeController: Contract;
  let threeGauges: string[];
  let snapshot: SnapshotRestorer;

  const GAUGE_WEIGHTS = Constants.GAUGE_WEIGHTS;
  const WEIGHT = BigNumber.from(10).pow(18);

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    // Contract factories
    const Token = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const GaugeController = await ethers.getContractFactory(
      "GaugeControllerV1"
    );
    const Minter = await ethers.getContractFactory("Minter");

    // Contract deployments
    const token = await Token.deploy();
    const votingEscrow = await VotingEscrow.deploy(
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    gaugeController = await upgrades.deployProxy(GaugeController, [
      token.address,
      votingEscrow.address,
    ]);

    const minter = await Minter.deploy(token.address, gaugeController.address);

    const LiquidityGauge = await ethers.getContractFactory("Gauge");
    const lg1 = await LiquidityGauge.deploy(minter.address);
    threeGauges = [lg1.address, lg1.address, lg1.address];
  });

  afterEach(async () => {
    await snapshot.restore();
  });
  describe("GaugeController GaugesWeights", function () {
    /*
    複数のGaugeの追加ができないことを確認
    */
    it("test_add_gauges", async function () {
      await gaugeController.addGauge(threeGauges[0], 0, GAUGE_WEIGHTS[0]);
      await expect(
        gaugeController.addGauge(threeGauges[1], 0, GAUGE_WEIGHTS[0])
      ).to.be.revertedWith("Only veYMWK Gauge can be added for V1");
    });

    /*
    Gauge追加前にnGaugesが0であること、Gauge追加後にnGaugesが1になることを確認
    */
    it("test_n_gauges", async function () {
      expect(await gaugeController.nGauges()).to.equal(0);

      await gaugeController.addGauge(threeGauges[0], 0, GAUGE_WEIGHTS[0]);

      expect(await gaugeController.nGauges()).to.equal(1);
    });

    /*
    同じGaugeを追加しようとしても、1つしか登録できない旨のエラーを返すことを確認
    */
    it("test_n_gauges_same_gauge", async function () {
      await gaugeController.addGauge(threeGauges[0], 0, GAUGE_WEIGHTS[0]);
      await expect(
        gaugeController.addGauge(threeGauges[0], 0, GAUGE_WEIGHTS[0])
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
      await gaugeController.addGauge(threeGauges[0], 0, GAUGE_WEIGHTS[0]);
      expect(await gaugeController.gaugeTypes(threeGauges[0])).to.equal(0);
    });

    /*
    gaugeRelativeWeight(相対Weight)は引数に関わらず固定値1e18を返却することを確認
    */
    it("test_relative_weight", async function () {
      await gaugeController.addGauge(threeGauges[0], 0, GAUGE_WEIGHTS[0]);

      const relativeWeight1 = await gaugeController.gaugeRelativeWeight(
        threeGauges[0],
        0
      );
      const relativeWeight2 = await gaugeController.gaugeRelativeWeight(
        ethers.constants.AddressZero,
        184681 // Just a random number
      );
      expect(relativeWeight1).to.be.eq(WEIGHT);
      expect(relativeWeight2).to.be.eq(WEIGHT);
    });
  });
});
