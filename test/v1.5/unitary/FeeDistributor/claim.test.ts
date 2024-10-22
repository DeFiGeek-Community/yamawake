import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { sendEther } from "../../../scenarioHelper";

describe("FeeDistributor", () => {
  const DAY = 86400;
  const WEEK = DAY * 7;

  let admin: SignerWithAddress, alice: SignerWithAddress;
  let feeDistributor: Contract;
  let votingEscrow: Contract;
  let factory: Contract;
  let token: Contract;
  let coinA: Contract;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();

    [admin, alice] = await ethers.getSigners();

    const FeeDistributor = await ethers.getContractFactory(
      "FeeDistributor",
      alice
    );
    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const Factory = await ethers.getContractFactory("Factory");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    coinA = await Token.deploy("Coin A", "USDA", 18);
    await coinA.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    factory = await Factory.deploy();
    await factory.waitForDeployment();

    feeDistributor = await FeeDistributor.deploy(
      votingEscrow.address,
      factory.address,
      await time.latest()
    );
    await feeDistributor.waitForDeployment();
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_tokenCheckpoint", () => {
    /*
      最後のチェックポイントがあった週が終わると、次回のチェックポイントがなくても最後のチェックポイントがあった週の報酬をクレームできることを確認

      |-x-|-●-|-x-|-E-|---|
      0   1   2   3   4
      x: checkpoint
      ●: 入金
      E: テスト完了時点

      E時点で1, 2の報酬がクレームできることを確認
    */
    it("test_tokenCheckpoint", async function () {
      const amount = ethers.parseEther("1000");

      await token.transfer(alice.address, amount);
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));

      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);
      const startTime = await time.latest();

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributor",
        admin
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime
      );
      await feeDistributor.waitForDeployment();

      await feeDistributor.checkpointToken(ethers.ZeroAddress);

      await time.increase(WEEK);
      await sendEther(feeDistributor.address, "10", admin);
      await time.increase(WEEK);

      await feeDistributor.checkpointToken(ethers.ZeroAddress);

      await time.increase(WEEK);

      const week1Timestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      const feeFirstWeek = await feeDistributor.tokensPerWeek(
        ethers.ZeroAddress,
        week1Timestamp - WEEK * 2
      );
      const feeSecondWeek = await feeDistributor.tokensPerWeek(
        ethers.ZeroAddress,
        week1Timestamp - WEEK
      );
      const totalFee = feeFirstWeek.add(feeSecondWeek);

      await expect(
        feeDistributor.connect(alice)["claim(address)"](ethers.ZeroAddress)
      ).to.changeEtherBalance(alice.address, totalFee);
    });
  });
});
