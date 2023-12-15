import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const DAY = 86400;
const WEEK = DAY * 7;
const MAX_EXAMPLES = 10;

/*
  ランダムな時間経過後にcheckpointTotalSupplyを数回呼ぶことで
  VotingEscrowのveYMWK残高と同期できることを確認
*/
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
        .approve(votingEscrow.address, ethers.constants.MaxUint256);
      await token
        .connect(accounts[0])
        .transfer(await accounts[i].address, ethers.utils.parseEther("1000"));
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
          BigNumber.from(stAmount[i].toFixed(0)).mul((1e14).toString()),
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