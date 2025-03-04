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
  SampleTemplate,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";
import { sendEther } from "../../../scenarioHelper";

describe("FeeDistributorV1", () => {
  const DAY = 86400;
  const WEEK = DAY * 7;

  let admin: SignerWithAddress, alice: SignerWithAddress;
  let feeDistributor: FeeDistributorV1;
  let votingEscrow: VotingEscrow;
  let factory: Factory;
  let token: YMWK;
  let coinA: MockToken;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();

    [admin, alice] = await ethers.getSigners();

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

  describe("test_tokenCheckpoint", () => {
    // チェックポイントが週をまたぐ場合
    // 前回チェックポイントの翌週からの報酬の分配が始まることを確認
    it("test_tokenCheckpoint", async function () {
      const startTime = await time.latest();

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        admin
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        startTime,
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      const week1Timestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      await time.increase(WEEK);
      await sendEther(feeDistributor.target, "10", admin);

      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      const week2Timestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      const tokenPerWeek1 = await feeDistributor.tokensPerWeek(
        ethers.ZeroAddress,
        week1Timestamp
      );
      const tokenPerWeek2 = await feeDistributor.tokensPerWeek(
        ethers.ZeroAddress,
        week2Timestamp
      );
      expect(tokenPerWeek1).to.be.eq(0);
      expect(tokenPerWeek2).to.be.eq(ethers.parseEther("10"));
    });

    // チェックポイントの間隔が20週間を超える場合の週ごとの報酬が
    // 直近20週間に均等に振り分けられていることを確認
    it("test_token_deposited_before", async function () {
      const fees: bigint[] = [];
      const startTime = await time.latest();

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        admin
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        startTime,
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      await feeDistributor.checkpointToken(ethers.ZeroAddress);

      const localSnapshot = await takeSnapshot();

      await time.increase(WEEK * 30);
      await sendEther(feeDistributor.target, "10", admin);

      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      let latestWeekTimestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      let fee = 0n;
      for (let i = 0; i < 30; i++) {
        fee = await feeDistributor.tokensPerWeek(
          ethers.ZeroAddress,
          latestWeekTimestamp - WEEK * i
        );
        if (i === 1) {
          expect(fee).to.be.gt(fees[0]);
        } else if (i > 1 && i < 20) {
          expect(fee).to.be.eq(fees[1]);
        } else if (i >= 20) {
          expect(fee).to.be.eq(0);
        }
        fees.push(fee);
      }

      await localSnapshot.restore();

      await time.increase(WEEK * 20);
      await sendEther(feeDistributor.target, "10", admin);

      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      latestWeekTimestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      fee = 0n;
      for (let i = 0; i < 21; i++) {
        fee = await feeDistributor.tokensPerWeek(
          ethers.ZeroAddress,
          latestWeekTimestamp - WEEK * i
        );
        expect(fee).to.be.eq(fees[i]);
      }
    });
  });
});
