import { expect } from "chai";
import { ethers } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { VotingEscrow, YMWK } from "../../../../typechain-types";

const DAY = 86400;
const WEEK = DAY * 7;

describe("VotingEscrow", function () {
  let accounts: SignerWithAddress[];
  let votingEscrow: VotingEscrow;
  let token: YMWK;
  let snapshot: SnapshotRestorer;

  beforeEach(async () => {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    const YMWK = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    token = await YMWK.deploy();
    await token.waitForDeployment();
    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken"
    );
    await votingEscrow.waitForDeployment();
    await token
      .connect(accounts[0])
      .approve(votingEscrow.target, ethers.parseEther("100"));
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  it("should allow any depositor to deposit for a user after toggleDepositForAllApproval is enabled", async () => {
    // ユーザーがロックを作成し、全てのデポジターに対してdepositForの実行を許可する
    await votingEscrow
      .connect(accounts[0])
      .createLock(ethers.parseEther("1"), (await time.latest()) + WEEK);
    await votingEscrow.connect(accounts[0]).toggleDepositForAllApproval();

    // 許可されたデポジターがdepositForを実行し、成功することを確認
    await expect(
      votingEscrow
        .connect(accounts[2])
        .depositFor(accounts[0].address, ethers.parseEther("10"))
    ).to.not.be.reverted;
  });

  it("should not allow a depositor to deposit for a user without toggleDepositForAllApproval enabled", async () => {
    // ユーザーがロックを作成するが、全てのデポジターに対する許可は行わない
    await votingEscrow
      .connect(accounts[0])
      .createLock(ethers.parseEther("1"), (await time.latest()) + WEEK);

    // 許可されていないデポジターがdepositForを実行しようとすると、失敗することを確認
    await expect(
      votingEscrow
        .connect(accounts[2])
        .depositFor(accounts[0].address, ethers.parseEther("10"))
    ).to.be.revertedWith("Not allowed to deposit for this address");
  });

  it("should toggle depositForAll approval back to original state after being called twice", async () => {
    // ユーザーがロックを作成し、全てのデポジターに対する許可をトグル操作で2回実行する
    await votingEscrow
      .connect(accounts[0])
      .createLock(ethers.parseEther("1"), (await time.latest()) + WEEK);
    await votingEscrow.connect(accounts[0]).toggleDepositForAllApproval(); // 許可を与える

    // 2回のトグル操作後、デポジターがdepositForを実行し、成功することを確認
    await expect(
      votingEscrow
        .connect(accounts[2])
        .depositFor(accounts[0].address, ethers.parseEther("10"))
    ).to.not.be.reverted;

    // さらにトグル操作を行い、許可を取り消す
    await votingEscrow.connect(accounts[0]).toggleDepositForAllApproval();

    // 許可が取り消された後、デポジターがdepositForを実行しようとすると、失敗することを確認
    await expect(
      votingEscrow
        .connect(accounts[2])
        .depositFor(accounts[0].address, ethers.parseEther("10"))
    ).to.be.revertedWith("Not allowed to deposit for this address");
  });
});
