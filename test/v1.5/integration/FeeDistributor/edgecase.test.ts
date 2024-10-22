import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, BigNumber } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deploySampleSaleTemplate } from "../../../scenarioHelper";

const DAY = 86400;
const WEEK = DAY * 7;
const TEMPLATE_NAME = ethers.encodeBytes32String("SampleTemplate");

/* 
エッジケースのテスト
*/
describe("FeeDistributor", function () {
  let accounts: SignerWithAddress[];
  let token: Contract;
  let coinA: Contract;
  let votingEscrow: Contract;
  let factory: Contract;
  let feeDistributor: Contract;
  let auction: Contract;
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
    await token.waitForDeployment();

    coinA = await Token.deploy("Coin A", "USDA", 18);
    await coinA.waitForDeployment();
    await coinA._mintForTesting(accounts[0].address, ethers.parseEther("500"));

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

    auction = await deploySampleSaleTemplate(
      factory,
      feeDistributor,
      token,
      coinA,
      TEMPLATE_NAME,
      accounts[0]
    );
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  // ユーザーのveロックと同一ブロック内でcheckpointが走る場合のテスト
  // veロックと同一ブロック内でcheckpointが走った場合に正しく分配が行われることを確認
  it("should distribute equally when checkpoint and ve lock run in the same block", async function () {
    // ユーザ1のロック
    await token.transfer(accounts[1].address, ethers.parseEther("1"));
    await token
      .connect(accounts[1])
      .approve(votingEscrow.address, ethers.parseEther("1"));
    await votingEscrow
      .connect(accounts[1])
      .createLock(ethers.parseEther("1"), (await time.latest()) + WEEK * 30);
    // Calling the mock function to add coinA to the reward list
    await auction.connect(accounts[0]).withdrawRaisedToken(coinA.address);

    // ユーザ2のロック準備
    await token.transfer(accounts[2].address, ethers.parseEther("1"));
    await token
      .connect(accounts[2])
      .approve(votingEscrow.address, ethers.parseEther("1"));

    // 基準となるチェックポイント作成
    const startTime: number = (
      await feeDistributor.startTime(coinA.address)
    ).toNumber();

    // 一度自動マイニングをOFF --->
    await network.provider.send("evm_setAutomine", [false]);

    await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + WEEK]);

    // Feeとして100 coinAを送信
    await coinA.transfer(feeDistributor.address, ethers.parseEther("100"));

    // Feeの分配
    await feeDistributor.connect(accounts[0]).checkpointToken(coinA.address);

    // ユーザ2が新しくロックを作成
    await votingEscrow
      .connect(accounts[2])
      .createLock(ethers.parseEther("1"), (await time.latest()) + WEEK * 30);

    // マイニングを実行（ユーザ2のロックとcheckpointTokenを同じブロックに含める）
    await network.provider.send("evm_mine");
    // <--- 自動マイニングの再開
    await network.provider.send("evm_setAutomine", [true]);

    // 5週間後に時間を進める
    await time.increaseTo(startTime + 5 * WEEK);

    // Feeとして100 coinAを送信し分配
    await coinA.transfer(feeDistributor.address, ethers.parseEther("100"));
    await feeDistributor.connect(accounts[0]).checkpointToken(coinA.address);

    await time.increaseTo(startTime + 7 * WEEK);

    await feeDistributor.connect(accounts[1])["claim(address)"](coinA.address);
    await feeDistributor.connect(accounts[2])["claim(address)"](coinA.address);

    const feeDistributorBalance = await coinA.balanceOf(feeDistributor.address);
    const user1Balance = await coinA.balanceOf(accounts[1].address);
    const user2Balance = await coinA.balanceOf(accounts[2].address);

    // console.log("FeeDistributor balance: ", feeDistributorBalance.toString());
    // console.log("User1 balance: ", user1Balance.toString());
    // console.log("User2 balance: ", user2Balance.toString());
    // console.log((await feeDistributor.veSupply(startTime)).toString());
    // console.log((await feeDistributor.veSupply(startTime + WEEK)).toString());
    // console.log(
    //   (await feeDistributor.veSupply(startTime + 2 * WEEK)).toString()
    // );

    expect(user1Balance).to.be.eq(user2Balance);
    expect(feeDistributorBalance).to.be.lessThan(10);
  });
});
