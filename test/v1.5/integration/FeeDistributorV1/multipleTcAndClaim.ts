import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deploySampleSaleTemplate, sendEther } from "../../../scenarioHelper";
import {
  Factory,
  FeeDistributorV1,
  MockToken,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

const DAY = 86400;
const WEEK = DAY * 7;

/* 
同じ週にtokenCheckpoint, claim, tokenCheckpoint, claimし、
2回目のclaimでは報酬は獲得できないが、翌週以降にクレームできることを確認
*/
describe("FeeDistributorV1", function () {
  let accounts: SignerWithAddress[];
  let token: YMWK;
  let coinA: MockToken;
  let votingEscrow: VotingEscrow;
  let factory: Factory;
  let feeDistributor: FeeDistributorV1;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();

    const FeeDistributor = await ethers.getContractFactory("FeeDistributorV1");
    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const Factory = await ethers.getContractFactory("Factory");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    coinA = await Token.deploy("Coin A", "USDA", 18);
    await coinA.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    factory = await Factory.deploy();
    await factory.waitForDeployment();

    feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
      votingEscrow.target,
      factory.target,
      await time.latest(),
    ])) as unknown as FeeDistributorV1;
    await feeDistributor.waitForDeployment();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  it("should not increase balance by claiming multiple times but can claim the next week", async function () {
    await token.transfer(accounts[1].address, ethers.parseEther("1"));
    await token
      .connect(accounts[1])
      .approve(votingEscrow.target, ethers.parseEther("1"));
    await votingEscrow
      .connect(accounts[1])
      .createLock(ethers.parseEther("1"), (await time.latest()) + WEEK * 8);

    // 翌々週の頭まで時間を進める
    const beginningOfWeekAfterNext =
      (Math.floor((await time.latest()) / WEEK) + 2) * WEEK;
    await time.increaseTo(beginningOfWeekAfterNext + 1);

    // Feeとして1ETHを送信し、分配後クレームする
    await sendEther(feeDistributor.target, "1", accounts[0]);
    await feeDistributor
      .connect(accounts[0])
      .checkpointToken(ethers.ZeroAddress);
    await feeDistributor
      .connect(accounts[1])
      ["claim(address)"](ethers.ZeroAddress);

    const tokenLastLastWeek1 = await feeDistributor.tokensPerWeek(
      ethers.ZeroAddress,
      beginningOfWeekAfterNext - WEEK * 2
    );
    const tokenLastWeek1 = await feeDistributor.tokensPerWeek(
      ethers.ZeroAddress,
      beginningOfWeekAfterNext - WEEK
    );
    const tokenThisWeek1 = await feeDistributor.tokensPerWeek(
      ethers.ZeroAddress,
      beginningOfWeekAfterNext
    );
    const tokenNextWeek1 = await feeDistributor.tokensPerWeek(
      ethers.ZeroAddress,
      beginningOfWeekAfterNext + WEEK
    );
    const balanceAlice1 = await ethers.provider.getBalance(accounts[1].address);

    expect(tokenLastWeek1).to.be.above(0);
    expect(tokenThisWeek1).to.be.above(0);
    expect(tokenNextWeek1).to.be.eq(0);

    // 1日時間を進める
    await time.increase(DAY);

    // さらにFeeとして1ETHを送信し、分配後クレームする
    await sendEther(feeDistributor.target, "1", accounts[0]);
    await feeDistributor
      .connect(accounts[0])
      .checkpointToken(ethers.ZeroAddress);
    await feeDistributor
      .connect(accounts[1])
      ["claim(address)"](ethers.ZeroAddress);

    const tokenLastLastWeek2 = await feeDistributor.tokensPerWeek(
      ethers.ZeroAddress,
      beginningOfWeekAfterNext - WEEK * 2
    );
    const tokenLastWeek2 = await feeDistributor.tokensPerWeek(
      ethers.ZeroAddress,
      beginningOfWeekAfterNext - WEEK
    );
    const tokenThisWeek2 = await feeDistributor.tokensPerWeek(
      ethers.ZeroAddress,
      beginningOfWeekAfterNext
    );
    const tokenNextWeek2 = await feeDistributor.tokensPerWeek(
      ethers.ZeroAddress,
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
      ["claim(address)"](ethers.ZeroAddress);
    const balanceAlice3 = await ethers.provider.getBalance(accounts[1].address);
    expect(balanceAlice3).to.be.above(balanceAlice2);
  });

  // トークンが遅れて追加された場合に一度で正しくクレームできるかの確認
  it("should be fully claimed in a single claim", async function () {
    await coinA._mintForTesting(accounts[0].address, ethers.parseEther("500"));
    const TEMPLATE_NAME = ethers.encodeBytes32String("SampleTemplate");
    const auction = await deploySampleSaleTemplate(
      factory,
      feeDistributor,
      token,
      coinA,
      TEMPLATE_NAME,
      accounts[0]
    );

    // ユーザ1のロック
    await token.transfer(accounts[1].address, ethers.parseEther("1"));
    await token
      .connect(accounts[1])
      .approve(votingEscrow.target, ethers.parseEther("1"));
    await votingEscrow
      .connect(accounts[1])
      .createLock(ethers.parseEther("1"), (await time.latest()) + WEEK * 61);

    // 60週間後に時間を進める
    await time.increaseTo((await time.latest()) + 60 * WEEK);

    // 一度自動マイニングをOFF --->
    await network.provider.send("evm_setAutomine", [false]);

    // Calling the mock function to add coinA to the reward list
    await auction.connect(accounts[0]).withdrawRaisedToken(coinA.target);

    // Feeとして100 coinAを送信し分配
    await coinA.transfer(feeDistributor.target, ethers.parseEther("100"));

    // <--- 自動マイニングの再開
    await network.provider.send("evm_setAutomine", [true]);

    await feeDistributor.connect(accounts[0]).checkpointToken(coinA.target);

    // 1週間時間を進める
    await time.increaseTo((await time.latest()) + WEEK);

    await feeDistributor.connect(accounts[1])["claim(address)"](coinA.target);

    const feeDistributorBalance = await coinA.balanceOf(feeDistributor.target);
    const user1Balance = await coinA.balanceOf(accounts[1].address);

    // const timeCursor = Number(await feeDistributor.timeCursor());
    // for (let i = 0; i < 60; i++) {
    //   console.log(
    //     (
    //       await feeDistributor.tokensPerWeek(
    //         coinA.target,
    //         timeCursor - WEEK * i
    //       )
    //     ).toString()
    //   );
    // }

    expect(user1Balance).to.be.eq(ethers.parseEther("100"));
    expect(feeDistributorBalance).to.be.eq(0);
  });
});
