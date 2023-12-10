import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { sendEther } from "../../../scenarioHelper";

const DAY = 86400;
const WEEK = DAY * 7;

describe("FeeDistributor", function () {
  let accounts: SignerWithAddress[];
  let token: Contract;
  let coinA: Contract;
  let votingEscrow: Contract;
  let factory: Contract;
  let feeDistributor: Contract;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();

    const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
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

    feeDistributor = await FeeDistributor.deploy(
      votingEscrow.address,
      factory.address,
      await time.latest(),
      accounts[0].address,
      accounts[0].address
    );
    await feeDistributor.deployed();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  // 同じ週に
  // tokenCheckpoint, claim, tokenCheckpoint, claim
  // 2回目のclaimでは報酬は獲得できないが、翌週以降にクレームできることを確認
  it("should not increase balance by claiming multiple times but can claim the next week", async function () {
    await token.transfer(accounts[1].address, ethers.utils.parseEther("1"));
    await token
      .connect(accounts[1])
      .approve(votingEscrow.address, ethers.utils.parseEther("1"));
    await votingEscrow
      .connect(accounts[1])
      .createLock(
        ethers.utils.parseEther("1"),
        (await time.latest()) + WEEK * 8
      );

    // 翌々週の頭まで時間を進める
    const beginningOfWeekAfterNext =
      (Math.floor((await time.latest()) / WEEK) + 2) * WEEK;
    await time.increaseTo(beginningOfWeekAfterNext + 1);

    // Feeとして1ETHを送信し、分配後クレームする
    await sendEther(feeDistributor.address, "1", accounts[0]);
    await feeDistributor
      .connect(accounts[0])
      .checkpointToken(ethers.constants.AddressZero);
    await feeDistributor
      .connect(accounts[1])
      ["claim(address)"](ethers.constants.AddressZero);

    const tokenLastLastWeek1 = await feeDistributor.tokensPerWeek(
      ethers.constants.AddressZero,
      beginningOfWeekAfterNext - WEEK * 2
    );
    const tokenLastWeek1 = await feeDistributor.tokensPerWeek(
      ethers.constants.AddressZero,
      beginningOfWeekAfterNext - WEEK
    );
    const tokenThisWeek1 = await feeDistributor.tokensPerWeek(
      ethers.constants.AddressZero,
      beginningOfWeekAfterNext
    );
    const tokenNextWeek1 = await feeDistributor.tokensPerWeek(
      ethers.constants.AddressZero,
      beginningOfWeekAfterNext + WEEK
    );
    const balanceAlice1 = await ethers.provider.getBalance(accounts[1].address);

    expect(tokenLastWeek1).to.be.above(0);
    expect(tokenThisWeek1).to.be.above(0);
    expect(tokenNextWeek1).to.be.eq(0);

    // 1日時間を進める
    await time.increase(DAY);

    // さらにFeeとして1ETHを送信し、分配後クレームする
    await sendEther(feeDistributor.address, "1", accounts[0]);
    await feeDistributor
      .connect(accounts[0])
      .checkpointToken(ethers.constants.AddressZero);
    await feeDistributor
      .connect(accounts[1])
      ["claim(address)"](ethers.constants.AddressZero);

    const tokenLastLastWeek2 = await feeDistributor.tokensPerWeek(
      ethers.constants.AddressZero,
      beginningOfWeekAfterNext - WEEK * 2
    );
    const tokenLastWeek2 = await feeDistributor.tokensPerWeek(
      ethers.constants.AddressZero,
      beginningOfWeekAfterNext - WEEK
    );
    const tokenThisWeek2 = await feeDistributor.tokensPerWeek(
      ethers.constants.AddressZero,
      beginningOfWeekAfterNext
    );
    const tokenNextWeek2 = await feeDistributor.tokensPerWeek(
      ethers.constants.AddressZero,
      beginningOfWeekAfterNext + WEEK
    );
    const balanceAlice2 = await ethers.provider.getBalance(accounts[1].address);

    expect(tokenLastWeek2).to.be.eq(tokenLastWeek1);
    expect(tokenThisWeek2).to.be.above(tokenThisWeek1);
    expect(tokenNextWeek2).to.be.eq(0);
    expect(balanceAlice2).to.be.lt(balanceAlice1); // Gas分減少

    // 1週間時間を進める
    await time.increase(WEEK * 2);

    // チェックポイントは不要
    await feeDistributor
      .connect(accounts[1])
      ["claim(address)"](ethers.constants.AddressZero);
    const balanceAlice3 = await ethers.provider.getBalance(accounts[1].address);
    expect(balanceAlice3).to.be.above(balanceAlice2);
  });
});
