import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  Factory,
  FeeDistributorV1,
  MockToken,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

describe("FeeDistributorV1", () => {
  const MAX_COIN = 20;

  let alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress;

  let distributor: FeeDistributorV1;
  let votingEscrow: VotingEscrow;
  let factory: Factory;
  let token: YMWK;
  let coins: MockToken[];
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob, charlie] = await ethers.getSigners();

    const FeeDistributor = await ethers.getContractFactory(
      "FeeDistributorV1",
      alice
    );
    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const Factory = await ethers.getContractFactory("Factory");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    coins = [];
    for (let i = 0; i < MAX_COIN; i++) {
      coins.push(await Token.deploy(`Coin ${i}`, `USD${i}`, 18));
      await coins[i].waitForDeployment();
    }

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    factory = await Factory.deploy();
    await factory.waitForDeployment();

    distributor = (await upgrades.deployProxy(FeeDistributor, [
      votingEscrow.target,
      factory.target,
      await time.latest(),
    ])) as unknown as FeeDistributorV1;
    await distributor.waitForDeployment();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_admin", () => {
    it("test_commit_admin_only", async function () {
      await expect(
        distributor.connect(bob).commitTransferOwnership(bob.address)
      ).to.be.revertedWith("admin only");
    });

    it("test_apply_admin_only", async function () {
      await expect(
        distributor.connect(bob).applyTransferOwnership()
      ).to.be.revertedWith("admin only");
    });

    it("test_commit_transfer_ownership", async function () {
      await distributor.commitTransferOwnership(bob.address);

      expect(await distributor.admin()).to.equal(alice.address);
      expect(await distributor.futureAdmin()).to.equal(bob.address);
    });

    it("test_apply_transfer_ownership", async function () {
      await distributor.commitTransferOwnership(bob.address);
      await distributor.applyTransferOwnership();

      expect(await distributor.admin()).to.equal(bob.address);
    });

    it("test_apply_without_commit", async function () {
      await expect(distributor.applyTransferOwnership()).to.be.revertedWith(
        "admin not set"
      );
    });
  });
});
