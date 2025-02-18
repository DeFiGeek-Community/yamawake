import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  RewardGaugeV1,
  GaugeControllerV1,
  MinterV1,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

/* 
Gauge, Minter, VotingEscrowのインテグレーションテスト
以下をランダムな順序で繰り返し、報酬額の整合性が合っていることを確認する
- ランダムな額をlock, extendLock, increaseAmount、withdraw
- ランダムなタイミングでMinterで報酬をclaim
*/
describe("RewardGaugeV1", function () {
  const ACCOUNT_NUM = 5;
  const MAX_EXAMPLES = 50;
  const STATEFUL_STEP_COUNT = 30;
  const WEEK = 86400 * 7;
  const YEAR = 86400 * 365;
  const two_to_the_256_minus_1 = ethers.MaxUint256;
  const MOUNT_DECIMALS = 3;
  const INFLATION_DELAY = YEAR;

  // Helper functions to generate random variables ----->
  function randomValue(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min) + min);
  }
  function getRandomAccountNum(): number {
    let rdm = Math.floor(Math.random() * ACCOUNT_NUM); //0~9 integer
    return rdm;
  }
  function getRandomWeeks(): number {
    return randomValue(1, 12);
  }
  function getRandomAmounts(): bigint {
    return BigInt(
      randomValue(1 * 10 ** MOUNT_DECIMALS, 100 * 10 ** MOUNT_DECIMALS) *
        10 ** (18 - MOUNT_DECIMALS)
    );
  }
  function getRandomsTime(): bigint {
    return BigInt(randomValue(0, 86400 * 3));
  }
  // ------------------------------------------------
  let accounts: SignerWithAddress[];
  let admin: SignerWithAddress;
  let votingEscrow: VotingEscrow;
  let gaugeController: GaugeControllerV1;
  let token: YMWK;
  let gauge: RewardGaugeV1;
  let minter: MinterV1;

  let lockedUntil: { [key: string]: number } = {};
  let userClaims: { [key: string]: { [key: number]: bigint[] } } = {}; // address -> block number -> [claimed, timeCursor]
  let claimableTokens: { [key: string]: { [key: number]: bigint[] } } = {}; // address -> block number -> [claimed, timeCursor]
  let initialTokenBalance: { [key: string]: bigint };
  let tokenLockByUser: { [key: string]: bigint };

  let snapshot: SnapshotRestorer;

  beforeEach(async () => {
    snapshot = await takeSnapshot();

    accounts = (await ethers.getSigners()).slice(0, ACCOUNT_NUM);
    admin = (await ethers.getSigners())[ACCOUNT_NUM];

    lockedUntil = {};
    userClaims = {};
    claimableTokens = {};
    initialTokenBalance = {};
    tokenLockByUser = {};

    const YMWK = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const GaugeController =
      await ethers.getContractFactory("GaugeControllerV1");
    const Minter = await ethers.getContractFactory("MinterV1");
    const Gauge = await ethers.getContractFactory("RewardGaugeV1");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken"
    );
    await votingEscrow.waitForDeployment();

    gaugeController = (await upgrades.deployProxy(GaugeController, [
      token.target,
      votingEscrow.target,
    ])) as unknown as GaugeControllerV1;
    await gaugeController.waitForDeployment();

    minter = (await upgrades.deployProxy(Minter, [
      token.target,
      gaugeController.target,
    ])) as unknown as MinterV1;
    await minter.waitForDeployment();

    // Set minter for the token
    await token.setMinter(minter.target);

    const tokenInflationStarts =
      (await token.startEpochTime()) + BigInt(INFLATION_DELAY);
    gauge = (await upgrades.deployProxy(Gauge, [
      minter.target,
      tokenInflationStarts,
    ])) as unknown as RewardGaugeV1;
    await gauge.waitForDeployment();

    for (let i = 0; i < ACCOUNT_NUM; i++) {
      // ensure accounts[:5] all have tokens that may be locked
      await token
        .connect(accounts[0])
        .transfer(accounts[i].address, ethers.parseEther("10000000"));
      await token
        .connect(accounts[i])
        .approve(votingEscrow.target, two_to_the_256_minus_1);

      userClaims[accounts[i].address] = [];
      claimableTokens[accounts[i].address] = [];
    }

    // accounts[0] locks 10,000,000 tokens for 2 years - longer than the maximum duration of the test
    await votingEscrow
      .connect(accounts[0])
      .createLock(
        ethers.parseEther("10000000"),
        (await time.latest()) + YEAR * 2
      );

    lockedUntil = {
      [accounts[0].address]: Number(
        await votingEscrow.lockedEnd(accounts[0].address)
      ),
    };

    // Advance time to when YMWK inflation starts
    await time.increaseTo(tokenInflationStarts);
    await token.updateMiningParameters();

    // Add Gauge
    await gaugeController.addGauge(gauge.target, 1, BigInt(1e18));

    // Initialize stats variables
    for (let i = 0; i < ACCOUNT_NUM; i++) {
      initialTokenBalance[accounts[i].address] = await token.balanceOf(
        accounts[i].address
      );
      tokenLockByUser[accounts[i].address] = 0n;
    }
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  //--------------------------------------------- functions -----------------------------------------------------------//
  async function _checkActiveLock(stAcct: SignerWithAddress) {
    // check if `st_acct` has an active lock
    if (!lockedUntil[stAcct.address]) {
      return false;
    }

    const currentTime = await time.latest();

    if (lockedUntil[stAcct.address] < currentTime) {
      const amount = (await votingEscrow.locked(stAcct.address)).amount;
      await votingEscrow.connect(stAcct).withdraw();
      delete lockedUntil[stAcct.address];
      if (amount) {
        tokenLockByUser[stAcct.address] =
          tokenLockByUser[stAcct.address] - amount;
      }
      return false;
    }

    return true;
  }
  //--------------------------------------------- randomly excuted functions -----------------------------------------------------------//
  async function ruleNewLock(
    stAcct?: SignerWithAddress,
    stAmount?: bigint,
    stWeeks?: number,
    stTime?: bigint
  ) {
    /*
    Add a new user lock.

    Arguments
    ---------
    stAcct : SignerWithAddress
        Account to lock tokens for. If this account already has an active
        lock, the rule is skipped.
    stAmount: bigint
        Amount of tokens to lock.
    stWeeks: number
        Duration of lock, given in weeks.
    stTime: bigint
        Duration to sleep before action, in seconds.
    */
    stAcct = stAcct || accounts[getRandomAccountNum()];
    stAmount = stAmount || getRandomAmounts();
    stWeeks = stWeeks || getRandomWeeks();
    stTime = stTime || getRandomsTime();

    console.log(`
    ruleNewLock --- 
    stAcct: ${
      stAcct.address
    }, stAmount: ${stAmount.toString()}, stWeeks: ${stWeeks.toString()}, stTime: ${stTime.toString()}, WEEK:${
      (await time.latest()) / WEEK
    }
    `);

    stTime > 0n && (await time.increase(stTime));

    if (!(await _checkActiveLock(stAcct))) {
      const until = (Math.floor((await time.latest()) / WEEK) + stWeeks) * WEEK;
      await votingEscrow.connect(stAcct).createLock(stAmount, until);
      lockedUntil[stAcct.address] = until;
      tokenLockByUser[stAcct.address] =
        tokenLockByUser[stAcct.address] + stAmount;
    }
  }

  async function ruleExtendLock(
    stAcct?: SignerWithAddress,
    stWeeks?: number,
    stTime?: bigint
  ) {
    /*
    Extend an existing user lock.

    Arguments
    ---------
    stAcct: SignerWithAddress
        Account to extend lock for. If this account does not have an active
        lock, the rule is skipped.
    stWeeks: number
        Duration to extend the lock, given in weeks.
    stTime: bigint
        Duration to sleep before action, in seconds.
    */
    stAcct = stAcct || accounts[getRandomAccountNum()];
    stWeeks = stWeeks || getRandomWeeks();
    stTime = stTime || getRandomsTime();

    console.log(`
    ruleExtendLock --- stAmount ${
      stAcct.address
    }, stAmount: ${stWeeks.toString()}, stTime: ${stTime.toString()}, WEEK:${
      (await time.latest()) / WEEK
    }
    `);

    stTime > 0n && (await time.increase(stTime));

    if (await _checkActiveLock(stAcct)) {
      const until =
        (Math.floor(
          Number(await votingEscrow.lockedEnd(stAcct.address)) / WEEK
        ) +
          stWeeks) *
        WEEK;
      const newUntil = Math.min(
        until,
        Math.floor(((await time.latest()) + YEAR * 4) / WEEK) * WEEK
      );
      await votingEscrow.connect(stAcct).increaseUnlockTime(newUntil);
      lockedUntil[stAcct.address] = newUntil;
    }
  }

  async function ruleIncreaseLockAmount(
    stAcct?: SignerWithAddress,
    stAmount?: bigint,
    stTime?: bigint
  ) {
    /*
    Increase the amount of an existing user lock.

    Arguments
    ---------
    stAcct : SignerWithAddress
        Account to increase lock amount for. If this account does not have an
        active lock, the rule is skipped.
    stAmount : bigint
        Amount of tokens to add to lock.
    stTime : bigint
        Duration to sleep before action, in seconds.
    */
    stAcct = stAcct || accounts[getRandomAccountNum()];
    stAmount = stAmount || getRandomAmounts();
    stTime = stTime || getRandomsTime();

    console.log(`
    ruleIncreaseLockAmount --- stAmount ${
      stAcct.address
    }, stAmount: ${stAmount.toString()}, stTime: ${stTime.toString()}, WEEK:${
      (await time.latest()) / WEEK
    }
    `);

    stTime > 0n && (await time.increase(stTime));

    if (await _checkActiveLock(stAcct)) {
      await votingEscrow.connect(stAcct).increaseAmount(stAmount);
      tokenLockByUser[stAcct.address] =
        tokenLockByUser[stAcct.address] + stAmount;
    }
  }

  async function ruleClaimFees(stAcct?: SignerWithAddress, stTime?: bigint) {
    /*
    Claim fees for a user.

    Arguments
    ---------
    stAcct : SignerWithAddress
        Account to claim fees for.
    stTime : bigint
        Duration to sleep before action, in seconds.
    */
    stAcct = stAcct || accounts[getRandomAccountNum()];
    stTime = stTime || getRandomsTime();

    console.log(`
    ruleClaimFees --- stAmount ${
      stAcct.address
    }, stTime: ${stTime.toString()}, WEEK:${(await time.latest()) / WEEK}
    `);

    stTime > 0n && (await time.increase(stTime));

    let claimed;
    let tx;
    let newClaimed;

    claimed = await token.balanceOf(stAcct.address);

    const claimableToken = await gauge.claimableTokens.staticCall(
      stAcct.address
    );
    tx = await minter.connect(stAcct).mint(gauge.target);

    newClaimed = (await token.balanceOf(stAcct.address)) - claimed;
    userClaims[stAcct.address][tx.blockNumber!] = [
      newClaimed,
      await gauge.timeCursorOf(stAcct.address),
    ];
    claimableTokens[stAcct.address][tx.blockNumber!] = [
      claimableToken,
      await gauge.timeCursorOf(stAcct.address),
    ];
  }

  async function teardown() {
    /*
    Claim fees for all accounts and verify that balance change matches integrateFraction.
    */
    console.log("teardown----");

    await time.increase(WEEK * 2);

    for (const acct of accounts) {
      // Finally, claiming by each account and save the stats for verification later.
      let claimed;
      let tx;
      let newClaimed;

      claimed = await token.balanceOf(acct.address);
      const claimableToken = await gauge.claimableTokens.staticCall(
        acct.address
      );
      tx = await minter.connect(acct).mint(gauge.target);

      newClaimed = (await token.balanceOf(acct.address)) - claimed;
      userClaims[acct.address][tx.blockNumber!] = [
        newClaimed,
        await gauge.timeCursorOf(acct.address),
      ];
      claimableTokens[acct.address][tx.blockNumber!] = [
        claimableToken,
        await gauge.timeCursorOf(acct.address),
      ];
    }

    const t0: number = Number(await gauge.startTime());
    const t1: number = Math.floor((await time.latest()) / WEEK) * WEEK;

    const tokensPerUserPerWeek: { [key: string]: bigint[] } = {};
    const tokensPerWeeks: bigint[] = [];

    for (let w = t0; w < t1 + WEEK; w += WEEK) {
      const tokensPerWeek = await gauge.tokensPerWeek(w);
      tokensPerWeeks.push(tokensPerWeek);

      for (const acct of accounts) {
        const veSupply = await gauge.veSupply(w);
        tokensPerUserPerWeek[acct.address] =
          tokensPerUserPerWeek[acct.address] || [];
        const tokens: bigint =
          veSupply === 0n
            ? 0n
            : (tokensPerWeek * (await gauge.veForAt(acct.address, w))) /
              (await gauge.veSupply(w));
        tokensPerUserPerWeek[acct.address].push(tokens);
      }
    }

    // Display results--------------------------------------------------
    // console.log(``);
    // console.log(`Results ------------------------>`);
    // console.log("Current timestamp: ", (await time.latest()).toString());
    // console.log(`[TokensPerWeek]`);
    // Object.entries(tokensPerWeeks).forEach((val) => {
    //   console.log(`${val.toString()}`);
    // });
    // console.log(``);
    // console.log(`[TokensPerUserPerWeek]`);
    // Object.entries(tokensPerUserPerWeek).forEach(([key, val]) => {
    //   console.log(`${key}: ${val}`);
    // });
    // console.log(``);
    // console.log(`[User claims]`);
    // Object.entries(userClaims).forEach(([key, val]) => {
    //   console.log(`${key}:`);
    //   Object.entries(val).forEach(([k, v]) => {
    //     console.log(`${k}: ${v}`);
    //   });
    //   console.log(``);
    // });
    // console.log(``);
    // console.log(`[User claimable tokens]`);
    // Object.entries(claimableTokens).forEach(([key, val]) => {
    //   console.log(`${key}:`);
    //   Object.entries(val).forEach(([k, v]) => {
    //     console.log(`${k}: ${v}`);
    //   });
    //   console.log(``);
    // });
    // console.log(``);
    // -------------------------------------------

    for (const acct of accounts) {
      const integrateFraction = await gauge.integrateFraction(acct.address);
      // Balances should match integrateFraction
      expect(await token.balanceOf(acct.address)).to.equal(
        integrateFraction +
          initialTokenBalance[acct.address] -
          tokenLockByUser[acct.address]
      );
      // Balances should match tokensPerUserPerWeek (derived from tokenPerWeek)
      expect(await token.balanceOf(acct.address)).to.equal(
        tokensPerUserPerWeek[acct.address].reduce(
          (a: bigint, b: bigint) => a + b,
          0n
        ) +
          initialTokenBalance[acct.address] -
          tokenLockByUser[acct.address]
      );
      Object.entries(userClaims[acct.address]).forEach(([k, v]) => {
        // claimableTokens which is saved just before claimimg and actually claimed amount should be identical
        expect(v[0]).to.be.eq(claimableTokens[acct.address][parseInt(k)][0]);
      });
    }
  }

  let func = [
    ruleNewLock,
    ruleExtendLock,
    ruleIncreaseLockAmount,
    ruleClaimFees,
  ];

  for (let i = 0; i < MAX_EXAMPLES; i++) {
    it(`should claim reward Try: ${i}`, async () => {
      const initializerSeed = Math.random();
      if (initializerSeed < 0.6) {
        await ruleNewLock();
      }

      const steps = randomValue(1, STATEFUL_STEP_COUNT);
      for (let x = 0; x < steps; x++) {
        let n = randomValue(0, func.length);
        await func[n]();
      }

      await teardown();
    });
  }
});
