import { expect } from "chai";
import { ethers } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { VotingEscrow, YMWK } from "../../../../typechain-types";
import { abs } from "../../../helper";

describe("Voting Powers Test", function () {
  // Test voting power in the following scenario.
  // Alice:
  // ~~~~~~~
  // ^
  // | *       *
  // | | \     |  \
  // | |  \    |    \
  // +-+---+---+------+---> t

  // Bob:
  // ~~~~~~~
  // ^
  // |         *
  // |         | \
  // |         |  \
  // +-+---+---+---+--+---> t

  // Alice has 100% of voting power in the first period.
  // She has 2/3 power at the start of 2nd period, with Bob having 1/2 power
  // (due to smaller locktime).
  // Alice's power grows to 100% by Bob's unlock.

  // Checking that totalSupply is appropriate.

  // After the test is done, check all over again with balanceOfAt / totalSupplyAt

  type Stage = {
    blockNumber: number;
    timestamp: number;
    bias?: string;
  };

  const H = 3600;
  const DAY = 86400;
  const WEEK = 7 * DAY;
  const MAXTIME = DAY * 365 * 4; // 126144000
  const SCALE = 1e20;
  const TOL = (120 / WEEK) * SCALE;

  let alice: SignerWithAddress, bob: SignerWithAddress;
  let votingEscrow: VotingEscrow;
  let token: YMWK;
  let t0: number;
  let wTotal, wAlice, wBob: bigint;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    const YMWK = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken"
    );
    await votingEscrow.waitForDeployment();

    [alice, bob] = await ethers.getSigners();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  it("test voting powers", async function () {
    const amount = ethers.parseEther("1000");
    await token.connect(alice).transfer(bob.address, amount);
    const stages: { [key: string]: Stage | Stage[] } = {};

    await token.connect(alice).approve(votingEscrow.target, amount * 10n);
    await token.connect(bob).approve(votingEscrow.target, amount * 10n);

    expect(await votingEscrow["totalSupply()"]()).to.equal(0);
    expect(await votingEscrow["balanceOf(address)"](alice.address)).to.equal(0);
    expect(await votingEscrow["balanceOf(address)"](bob.address)).to.equal(0);

    const timeToNextWeek =
      (Math.floor((await time.latest()) / WEEK) + 1) * WEEK -
      (await time.latest());

    // Move to timing which is good for testing - beginning of a UTC week
    await time.increase(timeToNextWeek);

    await ethers.provider.send("evm_increaseTime", [H]);

    stages["before_deposits"] = {
      blockNumber: await time.latestBlock(),
      timestamp: await time.latest(),
    };

    await votingEscrow
      .connect(alice)
      .createLock(amount, (await time.latest()) + WEEK);

    stages["alice_deposit"] = {
      blockNumber: await time.latestBlock(),
      timestamp: await time.latest(),
    };

    // console.log("alice_deposit", stages["alice_deposit"]);

    await time.increase(H);

    const totalSupply = await votingEscrow["totalSupply()"]();
    const aliceBalance = await votingEscrow["balanceOf(address)"](
      alice.address
    );

    expect(
      approx(
        totalSupply,
        (amount / BigInt(MAXTIME)) * BigInt(WEEK - 2 * H),
        TOL
      )
    ).to.be.true;
    expect(
      approx(
        aliceBalance,
        (amount / BigInt(MAXTIME)) * BigInt(WEEK - 2 * H),
        TOL
      )
    ).to.be.true;
    expect(await votingEscrow["balanceOf(address)"](bob.address)).to.equal(0);

    t0 = await time.latest();

    stages["alice_in_0"] = [];
    stages["alice_in_0"].push({
      blockNumber: await time.latestBlock(),
      timestamp: await time.latest(),
    });

    // console.log("alice_in_0", stages["alice_in_0"]);

    // Simulating the passage of time with 7 days and 24 hours per day
    for (let i = 0; i < 7; i++) {
      for (let _ = 0; _ < 24; _++) {
        await time.increase(H);
      }

      const dt = (await time.latest()) - t0;
      const totalSupply = await votingEscrow["totalSupply()"]();
      const aliceBalance = await votingEscrow["balanceOf(address)"](
        alice.address
      );

      expect(
        approx(
          totalSupply,
          (amount / BigInt(MAXTIME)) * BigInt(Math.max(WEEK - 2 * H - dt, 0)),
          TOL
        )
      ).to.be.true;
      expect(
        approx(
          aliceBalance,
          (amount / BigInt(MAXTIME)) * BigInt(Math.max(WEEK - 2 * H - dt, 0)),
          TOL
        )
      ).to.be.true;
      expect(await votingEscrow["balanceOf(address)"](bob.address)).to.equal(0);

      stages["alice_in_0"].push({
        blockNumber: await time.latestBlock(),
        timestamp: await time.latest(),
        bias: aliceBalance.toString(),
      });
    }
    // console.log("alice_in_0", stages["alice_in_0"]);
    await ethers.provider.send("evm_increaseTime", [H]);

    expect(await votingEscrow["balanceOf(address)"](alice.address)).to.equal(0);
    await votingEscrow.connect(alice).withdraw();
    stages["alice_withdraw"] = {
      blockNumber: await time.latestBlock(),
      timestamp: await time.latest(),
    };

    // console.log("alice_withdraw", stages["alice_withdraw"]);

    expect(await votingEscrow["totalSupply()"]()).to.equal(0);
    expect(await votingEscrow["balanceOf(address)"](alice.address)).to.equal(0);
    expect(await votingEscrow["balanceOf(address)"](bob.address)).to.equal(0);

    await time.increase(H);

    // Calculate the next week for round counting
    const nextWeek =
      (Math.floor((await time.latest()) / WEEK) + 1) * WEEK -
      (await time.latest());

    await time.increase(nextWeek);

    await votingEscrow
      .connect(alice)
      .createLock(amount, (await time.latest()) + 2 * WEEK);

    stages["alice_deposit_2"] = {
      blockNumber: await time.latestBlock(),
      timestamp: await time.latest(),
    };

    // console.log("alice_deposit_2", stages["alice_deposit_2"]);

    expect(
      approx(
        await votingEscrow["totalSupply()"](),
        (amount / BigInt(MAXTIME)) * BigInt(2 * WEEK),
        TOL
      )
    ).to.be.true;
    expect(
      approx(
        await votingEscrow["balanceOf(address)"](alice.address),
        (amount / BigInt(MAXTIME)) * BigInt(2 * WEEK),
        TOL
      )
    ).to.be.true;
    expect(await votingEscrow["balanceOf(address)"](bob.address)).to.equal(0);

    await votingEscrow
      .connect(bob)
      .createLock(amount, (await time.latest()) + WEEK);

    stages["bob_deposit_2"] = {
      blockNumber: await time.latestBlock(),
      timestamp: await time.latest(),
    };

    // console.log("bob_deposit_2", stages["bob_deposit_2"]);

    expect(
      approx(
        await votingEscrow["totalSupply()"](),
        (amount / BigInt(MAXTIME)) * BigInt(3 * WEEK),
        TOL
      )
    ).to.be.true;
    expect(
      approx(
        await votingEscrow["balanceOf(address)"](alice.address),
        (amount / BigInt(MAXTIME)) * BigInt(2 * WEEK),
        TOL
      )
    ).to.be.true;
    expect(
      approx(
        await votingEscrow["balanceOf(address)"](bob.address),
        (amount / BigInt(MAXTIME)) * BigInt(WEEK),
        TOL
      )
    ).to.be.true;

    t0 = await time.latest();
    await time.increase(H);

    stages["alice_bob_in_2"] = [];
    // Beginning of week: weight 3
    // End of week: weight 1
    for (let i = 0; i < 7; i++) {
      for (let _ = 0; _ < 24; _++) {
        await time.increase(H);
      }
      const dt = (await time.latest()) - t0;
      wTotal = await votingEscrow["totalSupply()"]();
      wAlice = await votingEscrow["balanceOf(address)"](alice.address);
      wBob = await votingEscrow["balanceOf(address)"](bob.address);
      expect(wTotal).to.equal(wAlice + wBob);
      expect(
        approx(
          wAlice,
          (amount / BigInt(MAXTIME)) * BigInt(Math.max(2 * WEEK - dt, 0)),
          TOL
        )
      ).to.be.true;
      expect(
        approx(
          wBob,
          (amount / BigInt(MAXTIME)) * BigInt(Math.max(WEEK - dt, 0)),
          TOL
        )
      ).to.be.true;

      stages["alice_bob_in_2"].push({
        blockNumber: await time.latestBlock(),
        timestamp: await time.latest(),
        bias: `${wAlice.toString()}, ${wBob.toString()}`,
      });
    }
    // console.log("alice_bob_in_2", stages["alice_bob_in_2"]);

    await time.increase(H);

    await votingEscrow.connect(bob).withdraw();
    t0 = await time.latest();
    stages["bob_withdraw_1"] = {
      blockNumber: await time.latestBlock(),
      timestamp: await time.latest(),
    };
    const wTotal1 = await votingEscrow["totalSupply()"]();
    const wAlice1 = await votingEscrow["balanceOf(address)"](alice.address);
    expect(wAlice1).to.equal(wTotal1);
    expect(
      approx(wTotal1, (amount / BigInt(MAXTIME)) * BigInt(WEEK - 2 * H), TOL)
    ).to.be.true;
    expect(await votingEscrow["balanceOf(address)"](bob.address)).to.equal(0);

    await time.increase(H);

    stages["alice_in_2"] = [];
    for (let i = 0; i < 7; i++) {
      for (let _ = 0; _ < 24; _++) {
        await time.increase(H);
      }
      const dt = (await time.latest()) - t0;
      wTotal = await votingEscrow["totalSupply()"]();
      wAlice = await votingEscrow["balanceOf(address)"](alice.address);
      expect(wTotal).to.equal(wAlice);
      expect(
        approx(
          wTotal,
          (amount / BigInt(MAXTIME)) * BigInt(Math.max(WEEK - dt - 2 * H, 0)),
          TOL
        )
      ).to.be.true;
      expect(await votingEscrow["balanceOf(address)"](bob.address)).to.equal(0);
      stages["alice_in_2"].push({
        blockNumber: await time.latestBlock(),
        timestamp: await time.latest(),
      });
    }
    // console.log("alice_in_2", stages["alice_in_2"]);

    await votingEscrow.connect(alice).withdraw();
    stages["alice_withdraw_2"] = {
      blockNumber: await time.latestBlock(),
      timestamp: await time.latest(),
    };

    await time.increase(H);

    await votingEscrow.connect(bob).withdraw();
    stages["bob_withdraw_2"] = {
      blockNumber: await time.latestBlock(),
      timestamp: await time.latest(),
    };
    // console.log("bob_withdraw_2", stages["bob_withdraw_2"]);

    expect(await votingEscrow["totalSupply()"]()).to.equal(0);
    expect(await votingEscrow["balanceOf(address)"](alice.address)).to.equal(0);
    expect(await votingEscrow["balanceOf(address)"](bob.address)).to.equal(0);

    // Now test historical balanceOfAt and others
    expect(
      await votingEscrow.balanceOfAt(
        alice.address,
        stages["before_deposits"].blockNumber
      )
    ).to.equal(0);
    expect(
      await votingEscrow.balanceOfAt(
        bob.address,
        stages["before_deposits"].blockNumber
      )
    ).to.equal(0);
    expect(
      await votingEscrow.totalSupplyAt(stages["before_deposits"].blockNumber)
    ).to.equal(0);

    wAlice = await votingEscrow.balanceOfAt(
      alice.address,
      stages["alice_deposit"].blockNumber
    );

    expect(approx(wAlice, (amount / BigInt(MAXTIME)) * BigInt(WEEK - H), TOL))
      .to.be.true;
    expect(
      await votingEscrow.balanceOfAt(
        bob.address,
        stages["alice_deposit"].blockNumber
      )
    ).to.equal(0);
    wTotal = await votingEscrow.totalSupplyAt(
      stages["alice_deposit"].blockNumber
    );
    expect(wAlice).to.equal(wTotal);

    for (let i = 0; i < stages["alice_in_0"].length; i++) {
      const block = stages["alice_in_0"][i].blockNumber;
      wAlice = await votingEscrow.balanceOfAt(alice.address, block);
      wBob = await votingEscrow.balanceOfAt(bob.address, block);
      wTotal = await votingEscrow.totalSupplyAt(block);
      expect(wBob).to.equal(0);
      expect(wAlice).to.equal(wTotal);
      const timeLeft = Math.floor((WEEK * (7 - i)) / 7) - 2 * H;
      const error1h = (H / timeLeft) * SCALE; // Rounding error of 1 block is possible, and we have 1h blocks
      expect(
        approx(wAlice, (amount / BigInt(MAXTIME)) * BigInt(timeLeft), error1h)
      ).to.be.true;
    }

    wTotal = await votingEscrow.totalSupplyAt(
      stages["alice_withdraw"].blockNumber
    );
    wAlice = await votingEscrow.balanceOfAt(
      alice.address,
      stages["alice_withdraw"].blockNumber
    );
    wBob = await votingEscrow.balanceOfAt(
      bob.address,
      stages["alice_withdraw"].blockNumber
    );
    expect(wAlice).to.equal(wBob);
    expect(wAlice).to.equal(wTotal);
    expect(wTotal).to.equal(0);

    wTotal = await votingEscrow.totalSupplyAt(
      stages["alice_deposit_2"].blockNumber
    );
    wAlice = await votingEscrow.balanceOfAt(
      alice.address,
      stages["alice_deposit_2"].blockNumber
    );
    expect(approx(wTotal, (amount / BigInt(MAXTIME)) * BigInt(2 * WEEK), TOL))
      .to.be.true;
    expect(wTotal).to.equal(wAlice);
    expect(
      await votingEscrow.balanceOfAt(
        bob.address,
        stages["alice_deposit_2"].blockNumber
      )
    ).to.equal(0);

    wTotal = await votingEscrow.totalSupplyAt(
      stages["bob_deposit_2"].blockNumber
    );
    wAlice = await votingEscrow.balanceOfAt(
      alice.address,
      stages["bob_deposit_2"].blockNumber
    );
    wBob = await votingEscrow.balanceOfAt(
      bob.address,
      stages["bob_deposit_2"].blockNumber
    );
    expect(wTotal).to.equal(wAlice + wBob);
    expect(approx(wTotal, (amount / BigInt(MAXTIME)) * BigInt(3 * WEEK), TOL))
      .to.be.true;
    expect(approx(wAlice, (amount / BigInt(MAXTIME)) * BigInt(2 * WEEK), TOL))
      .to.be.true;

    t0 = stages["bob_deposit_2"].timestamp;
    for (let i = 0; i < stages["alice_bob_in_2"].length; i++) {
      const block = stages["alice_bob_in_2"][i].blockNumber;
      wAlice = await votingEscrow.balanceOfAt(alice.address, block);
      wBob = await votingEscrow.balanceOfAt(bob.address, block);
      wTotal = await votingEscrow.totalSupplyAt(block);
      expect(wTotal).to.equal(wAlice + wBob);
      const dt = stages["alice_bob_in_2"][i].timestamp - t0;
      const error1h = (H / (2 * WEEK - i * DAY)) * SCALE; // Rounding error of 1 block is possible, and we have 1h blocks
      expect(
        approx(
          wAlice,
          (amount / BigInt(MAXTIME)) * BigInt(Math.max(2 * WEEK - dt, 0)),
          error1h
        )
      ).to.be.true;
      expect(
        approx(
          wBob,
          (amount / BigInt(MAXTIME)) * BigInt(Math.max(WEEK - dt, 0)),
          error1h
        )
      ).to.be.true;
    }

    wTotal = await votingEscrow.totalSupplyAt(
      stages["bob_withdraw_1"].blockNumber
    );
    wAlice = await votingEscrow.balanceOfAt(
      alice.address,
      stages["bob_withdraw_1"].blockNumber
    );
    wBob = await votingEscrow.balanceOfAt(
      bob.address,
      stages["bob_withdraw_1"].blockNumber
    );
    expect(wTotal).to.equal(wAlice);
    expect(
      approx(wTotal, (amount / BigInt(MAXTIME)) * BigInt(WEEK - 2 * H), TOL)
    ).to.be.true;
    expect(wBob).to.equal(0);

    t0 = stages["bob_withdraw_1"].timestamp;
    for (let i = 0; i < stages["alice_in_2"].length; i++) {
      const block = stages["alice_in_2"][i].blockNumber;
      wAlice = await votingEscrow.balanceOfAt(alice.address, block);
      const wBob = await votingEscrow.balanceOfAt(bob.address, block);
      wTotal = await votingEscrow.totalSupplyAt(block);
      expect(wTotal).to.equal(wAlice);
      expect(wBob).to.equal(0);
      const dt = stages["alice_in_2"][i].timestamp - t0;
      const error1h = (H / (WEEK - i * DAY + DAY)) * SCALE; // Rounding error of 1 block is possible, and we have 1h blocks

      expect(
        approx(
          wTotal,
          (amount / BigInt(MAXTIME)) * BigInt(Math.max(WEEK - dt - 2 * H, 0)),
          error1h
        )
      ).to.be.true;
    }

    wTotal = await votingEscrow.totalSupplyAt(
      stages["bob_withdraw_2"].blockNumber
    );
    wAlice = await votingEscrow.balanceOfAt(
      alice.address,
      stages["bob_withdraw_2"].blockNumber
    );
    const wBob4 = await votingEscrow.balanceOfAt(
      bob.address,
      stages["bob_withdraw_2"].blockNumber
    );
    expect(wTotal).to.equal(0);
    expect(wAlice).to.equal(0);
    expect(wBob4).to.equal(0);

    await showStats();
  });

  function approx(value: bigint, target: bigint, tol: number) {
    if (value === 0n && target === 0n) {
      return true;
    }

    const diff = abs(value - target);
    const sum = value + target;
    const ratio = (diff * 2n * BigInt(SCALE)) / sum;

    return ratio <= BigInt(tol);
  }

  async function showStats() {
    const initialBlock = (await votingEscrow.pointHistory(0)).blk;
    const latestBlock = await time.latestBlock();
    for (let i = initialBlock; i < latestBlock; i++) {
      let a = await votingEscrow.balanceOfAt(alice.address, `${i}`);
      let b = await votingEscrow.balanceOfAt(bob.address, `${i}`);
      console.log(`Block ${i}: a: ${a.toString()} b: ${b.toString()}`);
    }
    const epoch = await votingEscrow.epoch();
    const aliceEpoch = await votingEscrow.userPointEpoch(alice.address);
    const bobEpoch = await votingEscrow.userPointEpoch(bob.address);
    for (let i = 0; i <= epoch; i++) {
      let p = await votingEscrow.pointHistory(i);
      console.log(
        `epoch: ${i}: bias: ${p.bias.toString()} slope: ${p.slope.toString()} ts: ${p.ts.toString()} blk: ${p.blk.toString()}`
      );
    }
    for (let i = 0; i <= aliceEpoch; i++) {
      let p = await votingEscrow.userPointHistory(alice.address, i);
      let balanceAt =
        p.blk === 0n
          ? 0n
          : await votingEscrow.balanceOfAt(alice.address, p.blk);
      console.log(
        `alice epoch: ${i}: balanceAt: ${balanceAt.toString()} bias: ${p.bias.toString()} slope: ${p.slope.toString()} ts: ${p.ts.toString()} blk: ${p.blk.toString()}`
      );
    }
    for (let i = 0; i < bobEpoch; i++) {
      let p = await votingEscrow.userPointHistory(bob.address, i);
      let balanceAt =
        p.blk === 0n ? 0n : await votingEscrow.balanceOfAt(bob.address, p.blk);
      console.log(
        `bob epoch: ${i}: balanceAt: ${balanceAt.toString()} bias: ${p.bias.toString()} slope: ${p.slope.toString()} ts: ${p.ts.toString()} blk: ${p.blk.toString()}`
      );
    }
  }
});
