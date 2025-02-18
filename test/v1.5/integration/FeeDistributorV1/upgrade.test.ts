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
  UpgradableFeeDistributorTest,
} from "../../../../typechain-types";

const DAY = 86400;
const WEEK = DAY * 7;

/*
  Upgrade後にUpgrade前のデータが保持されれいることを確認
*/
describe("FeeDistributorV1 Upgrade", function () {
  let accounts: SignerWithAddress[];
  let token: YMWK;
  let coinA: MockToken;
  let votingEscrow: VotingEscrow;
  let factory: Factory;
  let feeDistributor: FeeDistributorV1 | UpgradableFeeDistributorTest;
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
      "vetoken"
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

  it("should upgrade successfully", async function () {
    await token.approve(votingEscrow.target, ethers.MaxUint256);
    await token.transfer(accounts[0].address, ethers.parseEther("1000"));

    await votingEscrow.createLock(
      ethers.parseEther("1"),
      (await time.latest()) + WEEK * 12
    );

    await time.increase(WEEK * 4);

    const weekEpoch = Math.floor(((await time.latest()) + WEEK) / WEEK) * WEEK; // WEEK * WEEK;
    await time.increaseTo(weekEpoch);
    await feeDistributor.checkpointTotalSupply();

    const veSupplyV1 = await feeDistributor.veSupply(weekEpoch);

    // 1) FeeDistributorV2へアップグレード
    const FeeDistributorV2 = await ethers.getContractFactory(
      "UpgradableFeeDistributorTest"
    );
    feeDistributor = (await upgrades.upgradeProxy(
      feeDistributor.target,
      FeeDistributorV2,
      { call: { fn: "initializeV2", args: [123] } }
    )) as unknown as UpgradableFeeDistributorTest;
    await feeDistributor.waitForDeployment();

    // 2) FeeDistributorV1のデータを保持していることを確認
    expect(await feeDistributor.veSupply(weekEpoch)).to.be.eq(veSupplyV1);

    // 3) FeeDistributorV1の新しいパラメータを保持していることを確認
    expect(await feeDistributor.newParam()).to.be.eq(123);

    // 4) FeeDistributorV1の新しい関数を実行できることを確認
    await feeDistributor.newMethod();
    expect(await feeDistributor.newParam()).to.be.eq(124);
  });
});
