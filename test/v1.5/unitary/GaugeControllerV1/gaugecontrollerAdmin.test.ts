import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { GaugeControllerV1 } from "../../../../typechain-types";

describe("GaugeControllerV1", function () {
  let accounts: SignerWithAddress[];
  let gaugeController: GaugeControllerV1;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    // Contract factories
    const Token = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const GaugeController =
      await ethers.getContractFactory("GaugeControllerV1");

    // Contract deployments
    const token = await Token.deploy();
    const votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken"
    );
    gaugeController = (await upgrades.deployProxy(GaugeController, [
      token.target,
      votingEscrow.target,
    ])) as unknown as GaugeControllerV1;
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("GaugeController GaugecontrollerAdmin", function () {
    it("test_commit_admin_only", async function () {
      await expect(
        gaugeController
          .connect(accounts[1])
          .commitTransferOwnership(accounts[1].address)
      ).to.be.revertedWith("admin only");
    });

    it("test_apply_admin_only", async function () {
      await expect(
        gaugeController.connect(accounts[1]).applyTransferOwnership()
      ).to.be.revertedWith("admin only");
    });

    it("test_commit_transfer_ownership", async function () {
      await gaugeController.commitTransferOwnership(accounts[1].address);

      expect(await gaugeController.admin()).to.equal(
        await accounts[0].getAddress()
      );
      expect(await gaugeController.futureAdmin()).to.equal(accounts[1].address);
    });

    it("test_apply_transfer_ownership", async function () {
      await gaugeController.commitTransferOwnership(accounts[1].address);
      await gaugeController.applyTransferOwnership();

      expect(await gaugeController.admin()).to.equal(accounts[1].address);
    });

    it("test_apply_without_commit", async function () {
      await expect(gaugeController.applyTransferOwnership()).to.be.revertedWith(
        "admin not set"
      );
    });
  });
});
