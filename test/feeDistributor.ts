import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { timeTravel, timeTravelTo, snapshot, restore } from "./scenarioHelper";

const DAY = 86400;
const WEEK = DAY * 7;
const YEAR = DAY * 365;

describe("FeeDistributor", () => {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  let distributor: Contract;
  let votingEscrow: Contract;
  let token: Contract;
  let coinA: Contract;

  beforeEach(async function () {
    [alice, bob, charlie] = await ethers.getSigners();

    const Distributor = await ethers.getContractFactory("FeeDistributor");
    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");

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

    distributor = await Distributor.deploy(
      votingEscrow.address,
      await time.latest(),
      coinA.address,
      alice.address,
      alice.address
    );
    await distributor.deployed();
  });

  // TODO
  // 下記の観点のテストを追加
  // https://discord.com/channels/729808684359876718/729812922649542758/1162241240360816730

  describe("test_checkpoints", () => {
    beforeEach(async function () {
      await token.approve(votingEscrow.address, ethers.constants.MaxUint256);
      await votingEscrow.createLock(
        ethers.utils.parseEther("1000"),
        (await time.latest()) + WEEK * 52
      );
    });
    it("test_checkpoint_total_supply", async function () {
      const startTime = await distributor.timeCursor();
      const weekEpoch =
        Math.floor(((await time.latest()) + WEEK) / WEEK) * WEEK;

      await timeTravelTo(weekEpoch);

      const weekBlock = await ethers.provider.getBlockNumber();

      await distributor.checkpointTotalSupply();

      expect(await distributor.veSupply(startTime)).to.equal(0);
      expect(await distributor.veSupply(weekEpoch)).to.equal(
        await votingEscrow.totalSupplyAt(weekBlock)
      );
    });

    it("test_advance_time_cursor", async function () {
      const startTime = (await distributor.timeCursor()).toNumber();
      await timeTravel(YEAR);
      await distributor.checkpointTotalSupply();
      const newTimeCursor = (await distributor.timeCursor()).toNumber();
      expect(newTimeCursor).to.equal(startTime + WEEK * 20);
      expect(await distributor.veSupply(startTime + WEEK * 19)).to.be.above(0);
      expect(await distributor.veSupply(startTime + WEEK * 20)).to.equal(0);

      await distributor.checkpointTotalSupply();

      expect(await distributor.timeCursor()).to.equal(startTime + WEEK * 40);
      expect(await distributor.veSupply(startTime + WEEK * 20)).to.be.above(0);
      expect(await distributor.veSupply(startTime + WEEK * 39)).to.be.above(0);
      expect(await distributor.veSupply(startTime + WEEK * 40)).to.equal(0);
    });

    it("test_claim_checkpoints_total_supply", async function () {
      const start_time = (await distributor.timeCursor()).toNumber();

      // Calling overloaded function!
      // https://docs.ethers.org/v3/api-contract.html#prototype
      await distributor.connect(alice)["claim()"]();

      expect((await distributor.timeCursor()).toNumber()).to.equal(
        start_time + WEEK
      );
    });

    it("test_toggle_allow_checkpoint", async function () {
      const lastTokenTime = (await distributor.lastTokenTime()).toNumber();

      await timeTravel(WEEK);

      await distributor.connect(alice)["claim()"]();
      expect((await distributor.lastTokenTime()).toNumber()).to.equal(
        lastTokenTime
      );

      await distributor.toggleAllowCheckpointToken();
      const tx = await distributor.connect(alice)["claim()"]();
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      expect((await distributor.lastTokenTime()).toNumber()).to.equal(
        block.timestamp
      );
    });
  });

  describe("test_claim_many", () => {
    const amount = ethers.utils.parseEther("1000");
    it("test_claim_many", async function () {
      for (let acct of [alice, bob, charlie]) {
        await token.connect(acct).approve(votingEscrow.address, amount.mul(10));
        await token.connect(alice).transfer(acct.address, amount);
        await votingEscrow
          .connect(acct)
          .createLock(
            amount,
            (await ethers.provider.getBlock("latest")).timestamp + 8 * WEEK
          );
      }
      await timeTravel(WEEK);
      let startTime = (await ethers.provider.getBlock("latest")).timestamp;
      await timeTravel(WEEK * 5);
      const Distributor = await ethers.getContractFactory("FeeDistributor");
      distributor = await Distributor.deploy(
        votingEscrow.address,
        startTime,
        coinA.address,
        alice.address,
        alice.address
      );
      await coinA._mintForTesting(
        distributor.address,
        ethers.utils.parseEther("10")
      );
      await distributor.checkpointToken();
      await timeTravel(WEEK);
      await distributor.checkpointToken();
      const snapshotId = await snapshot();
      await distributor
        .connect(alice)
        .claimMany(
          [alice.address, bob.address, charlie.address].concat(
            Array(17).fill(ethers.constants.AddressZero)
          )
        );
      let balances = [
        await coinA.balanceOf(alice.address),
        await coinA.balanceOf(bob.address),
        await coinA.balanceOf(charlie.address),
      ];
      await restore(snapshotId);
      await distributor.connect(alice)["claim()"]();
      await distributor.connect(bob)["claim()"]();
      await distributor.connect(charlie)["claim()"]();
      expect(balances).to.deep.equal([
        await coinA.balanceOf(alice.address),
        await coinA.balanceOf(bob.address),
        await coinA.balanceOf(charlie.address),
      ]);
    });
    it("test_claim_many_same_account", async function () {
      for (let acct of [alice, bob, charlie]) {
        await token.connect(acct).approve(votingEscrow.address, amount.mul(10));
        await token.connect(alice).transfer(acct.address, amount);
        await votingEscrow
          .connect(acct)
          .createLock(
            amount,
            (await ethers.provider.getBlock("latest")).timestamp + 8 * WEEK
          );
      }
      await timeTravel(WEEK);
      let startTime = (await ethers.provider.getBlock("latest")).timestamp;
      await timeTravel(WEEK * 5);

      const Distributor = await ethers.getContractFactory("FeeDistributor");
      distributor = await Distributor.deploy(
        votingEscrow.address,
        startTime,
        coinA.address,
        alice.address,
        alice.address
      );
      await distributor.deployed();

      await coinA._mintForTesting(
        distributor.address,
        ethers.utils.parseEther("10")
      );
      await distributor.checkpointToken();
      await timeTravel(WEEK);
      await distributor.checkpointToken();

      const expected = await distributor.connect(alice).callStatic["claim()"]();

      expect(expected).to.above(0);
      expect(
        await distributor
          .connect(alice)
          .claimMany(Array(20).fill(alice.address))
          .toString()
      ).to.changeTokenBalance(coinA, alice, expected);
    });
  });

  describe("test_fee_distribution", () => {
    it("test_deposited_after", async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
      await coinA._mintForTesting(bob.address, ethers.utils.parseEther("100"));

      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 7; j++) {
          await coinA
            .connect(bob)
            .transfer(distributor.address, ethers.utils.parseEther("1"));
          await distributor.checkpointToken();
          await distributor.checkpointTotalSupply();
          await timeTravel(DAY);
        }
      }

      await timeTravel(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(
          amount,
          (await ethers.provider.getBlock("latest")).timestamp + 3 * WEEK
        );
      await timeTravel(2 * WEEK);

      await distributor.connect(alice)["claim()"]();
      expect(
        await distributor.connect(alice)["claim()"]()
      ).to.changeTokenBalance(coinA, alice, 0);
    });

    it("test_deposited_during", async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
      await coinA._mintForTesting(bob.address, ethers.utils.parseEther("100"));

      await timeTravel(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(
          amount,
          (await ethers.provider.getBlock("latest")).timestamp + 8 * WEEK
        );
      await timeTravel(WEEK);

      const Distributor = await ethers.getContractFactory("FeeDistributor");
      distributor = await Distributor.deploy(
        votingEscrow.address,
        await time.latest(),
        coinA.address,
        alice.address,
        alice.address
      );
      await distributor.deployed();

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 7; j++) {
          await coinA
            .connect(bob)
            .transfer(distributor.address, ethers.utils.parseEther("1"));
          await distributor.checkpointToken();
          await distributor.checkpointTotalSupply();
          await timeTravel(DAY);
        }
      }

      await timeTravel(WEEK);
      await distributor.checkpointToken();
      await distributor.connect(alice)["claim()"]();

      const balanceAlice = await coinA.balanceOf(alice.address);
      const diff = Math.abs(
        balanceAlice.sub(ethers.utils.parseEther("21")).toNumber()
      );
      expect(diff).to.be.lessThan(10);
    });

    it("test_deposited_before", async function () {
      const [alice, bob] = await ethers.getSigners();
      const amount = ethers.utils.parseEther("1000");

      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
      await coinA
        .connect(bob)
        ._mintForTesting(bob.address, ethers.utils.parseEther("100"));

      await votingEscrow
        .connect(alice)
        .createLock(
          amount,
          (await ethers.provider.getBlock("latest")).timestamp + 8 * WEEK
        );
      await timeTravel(WEEK);
      const startTime = (await ethers.provider.getBlock("latest")).timestamp;
      await timeTravel(WEEK * 5);

      const Distributor = await ethers.getContractFactory("FeeDistributor");
      distributor = await Distributor.deploy(
        votingEscrow.address,
        startTime,
        coinA.address,
        alice.address,
        alice.address
      );
      await distributor.deployed();

      await coinA
        .connect(bob)
        .transfer(distributor.address, ethers.utils.parseEther("10"));
      await distributor.checkpointToken();
      await timeTravel(WEEK);
      await distributor.checkpointToken();
      await distributor.connect(alice)["claim()"]();

      const balanceAlice = await coinA.balanceOf(alice.address);
      expect(
        Math.abs(balanceAlice.sub(ethers.utils.parseEther("10")).toNumber())
      ).to.be.lessThan(10);
    });

    it("test_deposited_twice", async function () {
      const amount = ethers.utils.parseEther("1000");

      await token.approve(votingEscrow.address, amount.mul(10));
      await coinA._mintForTesting(bob.address, ethers.utils.parseEther("100"));

      const currentTimestamp = (await ethers.provider.getBlock("latest"))
        .timestamp;
      await votingEscrow.createLock(amount, currentTimestamp + 4 * WEEK);

      await timeTravel(WEEK);

      const startTime = (await ethers.provider.getBlock("latest")).timestamp;

      await timeTravel(3 * WEEK);

      await votingEscrow.connect(alice).withdraw();
      const excludeTime =
        Math.floor(
          (await ethers.provider.getBlock("latest")).timestamp / WEEK
        ) * WEEK;
      await votingEscrow
        .connect(alice)
        .createLock(
          amount,
          (await ethers.provider.getBlock("latest")).timestamp + 4 * WEEK
        );

      await timeTravel(2 * WEEK);

      const Distributor = await ethers.getContractFactory("FeeDistributor");
      distributor = await Distributor.deploy(
        votingEscrow.address,
        startTime,
        coinA.address,
        alice.address,
        alice.address
      );
      await distributor.deployed();

      await coinA
        .connect(bob)
        .transfer(distributor.address, ethers.utils.parseEther("10"));
      await distributor.checkpointToken();

      await timeTravel(WEEK);

      await distributor.checkpointToken();

      await distributor.connect(alice)["claim()"]();

      const tokensToExclude = await distributor.tokensPerWeek(excludeTime);

      expect(
        ethers.utils
          .parseEther("10")
          .sub(await coinA.balanceOf(alice.address))
          .sub(tokensToExclude)
      ).to.be.lt(10);
    });

    it("test_deposited_parallel", async function () {
      const amount = ethers.utils.parseEther("1000");

      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
      await token.connect(bob).approve(votingEscrow.address, amount.mul(10));
      await token.connect(alice).transfer(bob.address, amount);
      await coinA._mintForTesting(
        charlie.address,
        ethers.utils.parseEther("100")
      );

      const currentTimestamp = (await ethers.provider.getBlock("latest"))
        .timestamp;
      await votingEscrow
        .connect(alice)
        .createLock(amount, currentTimestamp + 8 * WEEK);
      await votingEscrow
        .connect(bob)
        .createLock(amount, currentTimestamp + 8 * WEEK);

      await timeTravel(WEEK);

      const startTime = (await ethers.provider.getBlock("latest")).timestamp;

      await timeTravel(5 * WEEK);

      const Distributor = await ethers.getContractFactory("FeeDistributor");
      distributor = await Distributor.deploy(
        votingEscrow.address,
        startTime,
        coinA.address,
        alice.address,
        alice.address
      );
      await distributor.deployed();

      await coinA
        .connect(charlie)
        .transfer(distributor.address, ethers.utils.parseEther("10"));
      await distributor.checkpointToken();

      await timeTravel(WEEK);

      await distributor.checkpointToken();

      await distributor.connect(alice)["claim()"]();
      await distributor.connect(bob)["claim()"]();

      const balanceAlice = await coinA.balanceOf(alice.address);
      const balanceBob = await coinA.balanceOf(bob.address);

      expect(balanceAlice).to.equal(balanceBob);
      expect(balanceAlice.add(balanceBob)).to.be.closeTo(
        ethers.utils.parseEther("10"),
        20
      );
    });
  });

  describe("test_kill_fee_distro", () => {
    let accounts: SignerWithAddress[];
    beforeEach(async () => {
      const Distributor = await ethers.getContractFactory("FeeDistributor");
      distributor = await Distributor.deploy(
        votingEscrow.address,
        await time.latest(),
        coinA.address,
        alice.address,
        bob.address
      );
      await distributor.deployed();
      accounts = await ethers.getSigners();
    });

    it("test_assumptions", async function () {
      expect(await distributor.isKilled()).to.be.false;
      expect(await distributor.emergencyReturn()).to.equal(bob.address);
    });

    it("test_kill", async function () {
      await distributor.connect(alice).killMe();
      expect(await distributor.isKilled()).to.be.true;
    });

    it("test_multi_kill", async function () {
      await distributor.connect(alice).killMe();
      await distributor.connect(alice).killMe();
      expect(await distributor.isKilled()).to.be.true;
    });

    it("test_killing_transfers_tokens", async function () {
      await coinA._mintForTesting(distributor.address, 31337);
      await distributor.connect(alice).killMe();

      expect(await distributor.emergencyReturn()).to.equal(bob.address);
      expect(await coinA.balanceOf(bob.address)).to.equal(31337);
    });

    it("test_multi_kill_token_transfer", async function () {
      await coinA._mintForTesting(distributor.address, 10000);
      await distributor.connect(alice).killMe();

      await coinA._mintForTesting(distributor.address, 30000);
      await distributor.connect(alice).killMe();

      expect(await distributor.emergencyReturn()).to.equal(bob.address);
      expect(await coinA.balanceOf(bob.address)).to.equal(40000);
    });

    for (let idx = 1; idx <= 2; idx++) {
      it(`test_only_admin_for_account_index_${idx}`, async function () {
        await expect(distributor.connect(accounts[idx]).killMe()).to.be
          .reverted;
      });

      it(`test_cannot_claim_after_killed_for_account_index_${idx}`, async function () {
        await distributor.connect(alice).killMe();
        await expect(distributor.connect(accounts[idx])["claim()"]()).to.be
          .reverted;
      });

      it(`test_cannot_claim_for_after_killed_for_account_index_${idx}`, async function () {
        await distributor.connect(alice).killMe();
        await expect(
          distributor.connect(accounts[idx])["claim(address)"](alice.address)
        ).to.be.reverted;
      });

      it(`test_cannot_claim_many_after_killed_for_account_index_${idx}`, async function () {
        await distributor.connect(alice).killMe();
        await expect(
          distributor
            .connect(accounts[idx])
            .claimMany(new Array(20).fill(alice.address))
        ).to.be.reverted;
      });
    }
  });
});
