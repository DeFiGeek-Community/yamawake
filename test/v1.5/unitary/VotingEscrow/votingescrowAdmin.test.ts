import { expect } from "chai";
import { ethers } from "hardhat";
import {
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { VotingEscrow, YMWK } from "../../../../typechain-types";

describe("VotingEscrow", () => {
  let votingEscrow: VotingEscrow;
  let token: YMWK;
  let accounts: SignerWithAddress[];
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    const YMWK = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    accounts = await ethers.getSigners();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  it("test_commit_admin_only", async function () {
    await expect(
      votingEscrow
        .connect(accounts[1])
        .commitTransferOwnership(accounts[1].address)
    ).to.be.revertedWith("admin only");
  });

  it("test_apply_admin_only", async function () {
    await expect(
      votingEscrow.connect(accounts[1]).applyTransferOwnership()
    ).to.be.revertedWith("admin only");
  });

  it("test_commit_transfer_ownership", async function () {
    await votingEscrow
      .connect(accounts[0])
      .commitTransferOwnership(accounts[1].address);

    expect(await votingEscrow.admin()).to.equal(accounts[0].address);
    expect(await votingEscrow.futureAdmin()).to.equal(accounts[1].address);
  });

  it("test_apply_transfer_ownership", async function () {
    await votingEscrow
      .connect(accounts[0])
      .commitTransferOwnership(accounts[1].address);
    await votingEscrow.connect(accounts[0]).applyTransferOwnership();

    expect(await votingEscrow.admin()).to.equal(accounts[1].address);
  });

  it("test_apply_without_commit", async function () {
    await expect(
      votingEscrow.connect(accounts[0]).applyTransferOwnership()
    ).to.be.revertedWith("admin not set");
  });
});
