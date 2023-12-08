import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { sendEther } from "../../../scenarioHelper";

const DAY = 86400;
const WEEK = DAY * 7;

describe("FeeDistributor", () => {
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

    const Distributor = await ethers.getContractFactory("FeeDistributor");
    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const Factory = await ethers.getContractFactory("Factory");

    token = await YMWK.deploy();
    await token.deployed();

    coinA = await Token.deploy("Coin A", "USDA", 18);
    await coinA.deployed();

    votingEscrow = await VotingEscrow.deploy(
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.deployed();

    factory = await Factory.deploy();
    await factory.deployed();

    feeDistributor = await Distributor.deploy(
      votingEscrow.address,
      factory.address,
      await time.latest(),
      alice.address,
      alice.address
    );
    await feeDistributor.deployed();
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
      const amount = ethers.utils.parseEther("1000");

      await token.transfer(alice.address, amount);
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));

      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);
      const startTime = await time.latest();

      const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime,
        admin.address,
        admin.address
      );
      await feeDistributor.deployed();

      await feeDistributor.checkpointToken(ethers.constants.AddressZero);

      await time.increase(WEEK);
      await sendEther(feeDistributor.address, "10", admin);
      await time.increase(WEEK);

      await feeDistributor.checkpointToken(ethers.constants.AddressZero);

      await time.increase(WEEK);

      const week1Timestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      const feeFirstWeek = await feeDistributor.tokensPerWeek(
        ethers.constants.AddressZero,
        week1Timestamp - WEEK * 2
      );
      const feeSecondWeek = await feeDistributor.tokensPerWeek(
        ethers.constants.AddressZero,
        week1Timestamp - WEEK
      );
      const totalFee = feeFirstWeek.add(feeSecondWeek);

      await expect(
        feeDistributor
          .connect(alice)
          ["claim(address)"](ethers.constants.AddressZero)
      ).to.changeEtherBalance(alice.address, totalFee);
    });
  });
});
