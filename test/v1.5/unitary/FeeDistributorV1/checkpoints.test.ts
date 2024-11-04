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
  FeeDistributor,
  MockToken,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

describe("FeeDistributorV1", () => {
  const DAY = 86400;
  const WEEK = DAY * 7;
  const YEAR = DAY * 365;
  const MAX_COIN = 20;

  let alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress;

  let distributor: FeeDistributor;
  let votingEscrow: VotingEscrow;
  let factory: Factory;
  let token: YMWK;
  let coins: MockToken[];
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob, charlie] = await ethers.getSigners();

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

    coins = [];
    for (let i = 0; i < MAX_COIN; i++) {
      coins.push(await Token.deploy(`Coin ${i}`, `USD${i}`, 18));
      await coins[i].waitForDeployment();
    }

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    factory = await Factory.deploy();
    await factory.waitForDeployment();

    distributor = (await upgrades.deployProxy(FeeDistributor, [
      votingEscrow.target,
      factory.target,
      await time.latest(),
    ])) as unknown as FeeDistributor;
    await distributor.waitForDeployment();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_checkpoints", () => {
    beforeEach(async function () {
      await token.approve(votingEscrow.target, ethers.MaxUint256);
      await votingEscrow.createLock(
        ethers.parseEther("1000"),
        (await time.latest()) + WEEK * 52
      );
    });
    it("test_checkpoint_total_supply", async function () {
      const startTime = await distributor.timeCursor();
      const weekEpoch =
        Math.floor(((await time.latest()) + WEEK) / WEEK) * WEEK;

      await time.increaseTo(weekEpoch);

      const weekBlock = await time.latestBlock();

      await distributor.checkpointTotalSupply();

      expect(await distributor.veSupply(startTime)).to.equal(0);
      expect(await distributor.veSupply(weekEpoch)).to.equal(
        await votingEscrow.totalSupplyAt(weekBlock)
      );
    });

    it("test_advance_time_cursor", async function () {
      const startTime = Number(await distributor.timeCursor());
      await time.increaseTo(startTime + YEAR);
      await distributor.checkpointTotalSupply();
      const newTimeCursor = await distributor.timeCursor();

      expect(newTimeCursor).to.equal(startTime + WEEK * 53);
      expect(await distributor.veSupply(startTime + WEEK * 52)).to.equal(0);
      for (let i = 0; i < 51; i++) {
        const veSupply = await distributor.veSupply(startTime + WEEK * i);
        // veSupply should be stored starting from 20 weeks ago
        if (i < 33) {
          expect(veSupply).to.equal(0);
        } else {
          expect(veSupply).to.be.above(0);
        }
      }
    });

    it("test_claim_checkpoints_total_supply", async function () {
      const start_time = Number(await distributor.timeCursor());

      await distributor.connect(alice)["claim(address)"](ethers.ZeroAddress);

      expect(await distributor.timeCursor()).to.equal(start_time + WEEK);
    });
  });
});
