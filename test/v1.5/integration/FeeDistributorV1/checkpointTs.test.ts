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

const DAY = 86400;
const WEEK = DAY * 7;
const MAX_EXAMPLES = 10;

/*
  ランダムな時間経過後にcheckpointTotalSupplyを数回呼ぶことで
  VotingEscrowのveYMWK残高と同期できることを確認
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

  function generateUniqueRandomNumbers(
    count: number,
    min: number,
    max: number
  ): number[] {
    const set = new Set<number>();
    while (set.size < count) {
      const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
      set.add(randomValue);
    }
    return Array.from(set);
  }

  it("test checkpoint total supply", async function () {
    const stAmount = generateUniqueRandomNumbers(MAX_EXAMPLES, 1e4, 100 * 1e4);
    const stLocktime = generateUniqueRandomNumbers(MAX_EXAMPLES, 1, 52);
    const stSleep = generateUniqueRandomNumbers(MAX_EXAMPLES, 1, 30);
    for (let i = 0; i < MAX_EXAMPLES; i++) {
      await token
        .connect(accounts[i])
        .approve(votingEscrow.target, ethers.MaxUint256);
      await token
        .connect(accounts[0])
        .transfer(await accounts[i].address, ethers.parseEther("1000"));
    }

    let finalLock = 0;
    for (let i = 0; i < MAX_EXAMPLES; i++) {
      const sleepTime = Math.floor(stSleep[i] * 86400);
      await ethers.provider.send("evm_increaseTime", [sleepTime]);
      const lockTime = (await time.latest()) + sleepTime + WEEK * stLocktime[i];
      finalLock = Math.max(finalLock, lockTime);

      await votingEscrow
        .connect(accounts[i])
        .createLock(
          BigInt(stAmount[i].toFixed(0)) * BigInt(1e14),
          Math.floor(lockTime)
        );
    }

    while ((await time.latest()) < finalLock) {
      const weekEpoch =
        Math.floor(((await time.latest()) + WEEK) / WEEK) * WEEK; // WEEK * WEEK;

      await time.increaseTo(weekEpoch);

      const weekBlock = await time.latestBlock();

      await ethers.provider.send("evm_increaseTime", [1]);

      // Max: 42 weeks
      // doing checkpoint 3 times is enough
      for (let i = 0; i < 3; i++) {
        await feeDistributor.connect(accounts[0]).checkpointTotalSupply();
      }

      const expected = await votingEscrow.totalSupplyAt(weekBlock);
      const actual = await feeDistributor.veSupply(weekEpoch);
      console.log(`expected: ${expected} actual: ${actual}`);
      expect(actual).to.equal(expected);
    }
  });
});
