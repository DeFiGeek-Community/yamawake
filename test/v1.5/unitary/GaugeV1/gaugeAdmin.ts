import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import Constants from "../../../lib/Constants";
import { GaugeV1, VotingEscrow, YMWK } from "../../../../typechain-types";

describe("Gauge checkpoint", function () {
  let accounts: SignerWithAddress[];
  let gauge: GaugeV1;
  let token: YMWK;
  let votingEscrow: VotingEscrow;
  let snapshot: SnapshotRestorer;
  const year = Constants.year;
  const INFLATION_DELAY = BigInt(year);

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    // Contract factories
    const Token = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const GaugeController =
      await ethers.getContractFactory("GaugeControllerV1");
    const Gauge = await ethers.getContractFactory("GaugeV1");
    const Minter = await ethers.getContractFactory("Minter");

    // Contract deployments
    token = await Token.deploy();
    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    const gaugeController = await upgrades.deployProxy(GaugeController, [
      token.target,
      votingEscrow.target,
    ]);

    const minter = await Minter.deploy(token.target, gaugeController.target);

    const tokenInflationStarts: bigint =
      (await token.startEpochTime()) + INFLATION_DELAY;
    gauge = (await upgrades.deployProxy(Gauge, [
      minter.target,
      tokenInflationStarts,
    ])) as unknown as GaugeV1;
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_admin", () => {
    it("test_commit_admin_only", async function () {
      await expect(
        gauge.connect(accounts[1]).commitTransferOwnership(accounts[1].address)
      ).to.be.revertedWith("admin only");
    });

    it("test_apply_admin_only", async function () {
      await expect(
        gauge.connect(accounts[1]).applyTransferOwnership()
      ).to.be.revertedWith("admin only");
    });

    it("test_commit_transfer_ownership", async function () {
      await gauge.commitTransferOwnership(accounts[1].address);

      expect(await gauge.admin()).to.equal(await accounts[0].getAddress());
      expect(await gauge.futureAdmin()).to.equal(accounts[1].address);
    });

    it("test_apply_transfer_ownership", async function () {
      await gauge.commitTransferOwnership(accounts[1].address);
      await gauge.applyTransferOwnership();

      expect(await gauge.admin()).to.equal(accounts[1].address);
    });

    it("test_apply_without_commit", async function () {
      await expect(gauge.applyTransferOwnership()).to.be.revertedWith(
        "admin not set"
      );
    });
  });
});
