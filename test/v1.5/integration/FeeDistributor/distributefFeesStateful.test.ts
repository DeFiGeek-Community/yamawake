import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { deploySampleSaleTemplate } from "../../../scenarioHelper";

const ACCOUNT_NUM = 5;
const MAX_EXAMPLES = 50;
const STATEFUL_STEP_COUNT = 30;
const FEE_TOKEN_NUM = 2;
const WEEK = 86400 * 7;
const YEAR = 86400 * 365;
const two_to_the_256_minus_1 = BigNumber.from("2")
  .pow(BigNumber.from("256"))
  .sub(BigNumber.from("1"));
const MOUNT_DECIMALS = 3;
const TEMPLATE_NAME = ethers.utils.formatBytes32String("SampleTemplate");

// Helper functions to generate random variables ----->
function randomBigValue(min: number, max: number): BigNumber {
  return BigNumber.from(
    Math.floor(Math.random() * (max - min) + min).toString()
  );
}
function randomValue(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}
function getRandomAccountNum(): number {
  let rdm = Math.floor(Math.random() * ACCOUNT_NUM); //0~9 integer
  return rdm;
}
function getRandomWeeks(): BigNumber {
  return randomBigValue(1, 12);
}
function getRandomAmounts(): BigNumber {
  return randomBigValue(
    1 * 10 ** MOUNT_DECIMALS,
    100 * 10 ** MOUNT_DECIMALS
  ).mul(BigNumber.from(10).pow(18 - MOUNT_DECIMALS));
}
function getRandomsTime(): BigNumber {
  return randomBigValue(0, 86400 * 3);
}
// ------------------------------------------------
/* 
FeeDistributor, VotingEscrowのインテグレーションテスト。
以下をランダムな順序で繰り返し、
FeeDistributorに記録される週ごとの報酬額の合計とそれぞれアカウントの最終的な残高の変化が一致していること、
FeeDistributorが全ての残高を報酬として送金完了していることを確認する
- ランダムな額をlock, extendLock, increaseAmount、withdraw
- ランダムな額をFeeDistributorに送金
- ランダムな額をFeeDistributorに送金し、tokenCheckpoint
- 報酬のクレーム
*/
describe("FeeDistributor", function () {
  let accounts: SignerWithAddress[];
  let admin: SignerWithAddress; // FeeDistributor Admin
  let votingEscrow: Contract;
  let factory: Contract;
  let distributor: Contract;
  let feeCoin: Contract;
  let token: Contract;
  let auction: Contract;

  let lockedUntil: { [key: string]: number } = {};
  let fees: { [key: number]: BigNumber } = {}; // block number -> amount
  let userClaims: { [key: string]: { [key: number]: BigNumber[] } } = {}; // address -> block number -> [claimed, timeCursor]
  let userGases: { [key: string]: BigNumber }; // address -> total gas fee
  let initialEthBalance: { [key: string]: BigNumber };
  let totalFees: BigNumber = ethers.utils.parseEther("1");

  let tokenAddresses: string[];
  let stToken: string;

  let snapshot: SnapshotRestorer;

  beforeEach(async () => {
    snapshot = await takeSnapshot();

    accounts = (await ethers.getSigners()).slice(0, ACCOUNT_NUM);
    admin = (await ethers.getSigners())[ACCOUNT_NUM];

    lockedUntil = {};
    fees = {};
    userClaims = {};
    userGases = {};
    initialEthBalance = {};
    totalFees = ethers.utils.parseEther("1");

    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const FeeDistributor = await ethers.getContractFactory(
      "FeeDistributor",
      admin
    );
    const Factory = await ethers.getContractFactory("Factory");

    token = await YMWK.deploy();
    await token.deployed();

    feeCoin = await Token.deploy("Test Token", "TST", 18);
    await feeCoin.deployed();

    votingEscrow = await VotingEscrow.deploy(
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.deployed();

    factory = await Factory.deploy();
    await factory.deployed();

    for (let i = 0; i < ACCOUNT_NUM; i++) {
      // ensure accounts[:5] all have tokens that may be locked
      await token
        .connect(accounts[0])
        .transfer(accounts[i].address, ethers.utils.parseEther("10000000"));
      await token
        .connect(accounts[i])
        .approve(votingEscrow.address, two_to_the_256_minus_1);

      userClaims[accounts[i].address] = [];
    }

    // accounts[0] locks 10,000,000 tokens for 2 years - longer than the maximum duration of the test
    await votingEscrow
      .connect(accounts[0])
      .createLock(
        ethers.utils.parseEther("10000000"),
        (await time.latest()) + YEAR * 2
      );

    lockedUntil = {
      [accounts[0].address]: (
        await votingEscrow.lockedEnd(accounts[0].address)
      ).toNumber(),
    };

    // a week later we deploy the fee distributor
    // await ethers.provider.send("evm_increaseTime", [WEEK]);
    await time.increase(WEEK);

    distributor = await FeeDistributor.deploy(
      votingEscrow.address,
      factory.address,
      await time.latest()
    );
    await distributor.deployed();

    tokenAddresses = [ethers.constants.AddressZero, feeCoin.address];

    auction = await deploySampleSaleTemplate(
      factory,
      distributor,
      token,
      feeCoin,
      TEMPLATE_NAME,
      admin
    );

    // Calling the mock function to add coinA to the reward list
    await auction.connect(admin).withdrawRaisedToken(feeCoin.address);

    for (let i = 0; i < ACCOUNT_NUM; i++) {
      initialEthBalance[accounts[i].address] = await accounts[i].getBalance();
      userGases[accounts[i].address] = ethers.BigNumber.from("0");
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
      let tx = await votingEscrow.connect(stAcct).withdraw();
      let receipt = await tx.wait();
      userGases[stAcct.address] = userGases[stAcct.address].add(
        receipt.effectiveGasPrice.mul(receipt.gasUsed)
      );
      delete lockedUntil[stAcct.address];
      return false;
    }

    return true;
  }
  //--------------------------------------------- randomly excuted functions -----------------------------------------------------------//
  async function ruleNewLock(
    stAcct?: SignerWithAddress,
    stAmount?: BigNumber,
    stWeeks?: BigNumber,
    stTime?: BigNumber
  ) {
    /*
    Add a new user lock.

    Arguments
    ---------
    stAcct : SignerWithAddress
        Account to lock tokens for. If this account already has an active
        lock, the rule is skipped.
    stAmount: BigNumber
        Amount of tokens to lock.
    stWeeks: BigNumber
        Duration of lock, given in weeks.
    stTime: BigNumber
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

    stTime.gt(0) && (await time.increase(stTime));

    if (!(await _checkActiveLock(stAcct))) {
      const until =
        (Math.floor((await time.latest()) / WEEK) + stWeeks.toNumber()) * WEEK;
      let tx = await votingEscrow.connect(stAcct).createLock(stAmount, until);
      let receipt = await tx.wait();
      userGases[stAcct.address] = userGases[stAcct.address].add(
        receipt.effectiveGasPrice.mul(receipt.gasUsed)
      );
      lockedUntil[stAcct.address] = until;
    }
  }

  async function ruleExtendLock(
    stAcct?: SignerWithAddress,
    stWeeks?: BigNumber,
    stTime?: BigNumber
  ) {
    /*
    Extend an existing user lock.

    Arguments
    ---------
    stAcct: SignerWithAddress
        Account to extend lock for. If this account does not have an active
        lock, the rule is skipped.
    stWeeks: BigNumber
        Duration to extend the lock, given in weeks.
    stTime: BigNumber
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

    stTime.gt(0) && (await time.increase(stTime));

    if (await _checkActiveLock(stAcct)) {
      const until =
        (Math.floor(
          (await votingEscrow.lockedEnd(stAcct.address)).toNumber() / WEEK
        ) +
          stWeeks.toNumber()) *
        WEEK;
      const newUntil = Math.min(
        until,
        Math.floor(((await time.latest()) + YEAR * 4) / WEEK) * WEEK
      );
      let tx = await votingEscrow.connect(stAcct).increaseUnlockTime(newUntil);
      let receipt = await tx.wait();
      userGases[stAcct.address] = userGases[stAcct.address].add(
        receipt.effectiveGasPrice.mul(receipt.gasUsed)
      );
      lockedUntil[stAcct.address] = newUntil;
    }
  }

  async function ruleIncreaseLockAmount(
    stAcct?: SignerWithAddress,
    stAmount?: BigNumber,
    stTime?: BigNumber
  ) {
    /*
    Increase the amount of an existing user lock.

    Arguments
    ---------
    stAcct : SignerWithAddress
        Account to increase lock amount for. If this account does not have an
        active lock, the rule is skipped.
    stAmount : BigNumber
        Amount of tokens to add to lock.
    stTime : number
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

    stTime.gt(0) && (await time.increase(stTime));

    if (await _checkActiveLock(stAcct)) {
      let tx = await votingEscrow.connect(stAcct).increaseAmount(stAmount);
      let receipt = await tx.wait();
      userGases[stAcct.address] = userGases[stAcct.address].add(
        receipt.effectiveGasPrice.mul(receipt.gasUsed)
      );
    }
  }

  async function ruleClaimFees(stAcct?: SignerWithAddress, stTime?: BigNumber) {
    /*
    Claim fees for a user.

    Arguments
    ---------
    stAcct : SignerWithAddress
        Account to claim fees for.
    stTime : number
        Duration to sleep before action, in seconds.
    */
    stAcct = stAcct || accounts[getRandomAccountNum()];
    stTime = stTime || getRandomsTime();

    console.log(`
    ruleClaimFees --- stAmount ${
      stAcct.address
    }, stTime: ${stTime.toString()}, WEEK:${(await time.latest()) / WEEK}
    `);

    stTime.gt(0) && (await time.increase(stTime));

    let claimed;
    let tx;
    let newClaimed;

    if (stToken === ethers.constants.AddressZero) {
      claimed = await ethers.provider.getBalance(stAcct.address);
      tx = await distributor
        .connect(stAcct)
        ["claim(address)"](ethers.constants.AddressZero);
      const receipt = await tx.wait();
      const gas = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      userGases[stAcct.address] = userGases[stAcct.address].add(gas);

      newClaimed = (await ethers.provider.getBalance(stAcct.address))
        .sub(claimed)
        .add(gas);
    } else {
      claimed = await feeCoin.balanceOf(stAcct.address);
      tx = await distributor.connect(stAcct)["claim(address)"](stToken);
      let receipt = await tx.wait();
      userGases[stAcct.address] = userGases[stAcct.address].add(
        receipt.effectiveGasPrice.mul(receipt.gasUsed)
      );
      newClaimed = (await feeCoin.balanceOf(stAcct.address)).sub(claimed);
    }
    userClaims[stAcct.address][tx.blockNumber] = [
      newClaimed,
      await distributor.timeCursorOf(stToken, stAcct.address),
    ];
  }

  async function ruleTransferFees(stAmount?: BigNumber, stTime?: BigNumber) {
    /*
    Transfer fees into the distributor and make a checkpoint.

    If this is the first checkpoint, `can_checkpoint_token` is also
    enabled.

    Arguments
    ---------
    stAmount : BigNumber
        Amount of fee tokens to add to the distributor.
    stTime : number
        Duration to sleep before action, in seconds.
    */
    stAmount = stAmount || getRandomAmounts();
    stTime = stTime || getRandomsTime();

    console.log(`
    ruleTransferFees --- stAmount ${stAmount.toString()}, stTime: ${stTime.toString()}, WEEK:${
      (await time.latest()) / WEEK
    }
    `);

    stTime.gt(0) && (await time.increase(stTime));

    let tx;
    if (stToken === ethers.constants.AddressZero) {
      tx = await admin.sendTransaction({
        to: distributor.address,
        value: stAmount,
      });
    } else {
      const Token = await ethers.getContractFactory("MockToken");
      tx = await Token.attach(stToken)
        .connect(admin)
        ._mintForTesting(distributor.address, stAmount);
    }

    await distributor.connect(admin).checkpointToken(stToken);

    fees[tx.blockNumber] = stAmount;
    totalFees = totalFees.add(stAmount);
  }

  async function ruleTransferFeesWithoutCheckpoint(
    stAmount?: BigNumber,
    stTime?: BigNumber
  ) {
    /*
    Transfer fees into the distributor without checkpointing.

    Arguments
    ---------
    stAmount : BigNumber
        Amount of fee tokens to add to the distributor.
    stTime : number
        Duration to sleep before action, in seconds.
    */
    stAmount = stAmount || getRandomAmounts();
    stTime = stTime || getRandomsTime();

    console.log(`
    ruleTransferFeesWithoutCheckpoint --- stAmount ${stAmount.toString()}, stTime: ${stTime.toString()}, WEEK:${
      (await time.latest()) / WEEK
    }
    `);

    stTime.gt(0) && (await time.increase(stTime));

    let tx;
    if (stToken === ethers.constants.AddressZero) {
      tx = await admin.sendTransaction({
        to: distributor.address,
        value: stAmount,
      });
    } else {
      const Token = await ethers.getContractFactory("MockToken");
      tx = await Token.attach(stToken)
        .connect(admin)
        ._mintForTesting(distributor.address, stAmount);
    }

    fees[tx.blockNumber] = stAmount;
    totalFees = totalFees.add(stAmount);
  }

  async function teardown() {
    /*
    Claim fees for all accounts and verify that only dust remains.
    */
    console.log("teardown----");
    const startTime = await distributor.startTime();
    const lastTokenTime = await distributor.lastTokenTime(stToken);
    if (lastTokenTime.eq(0) || lastTokenTime.eq(startTime)) {
      //if no token checkpoint occured, add 100,000 tokens prior to teardown
      await ruleTransferFees(
        ethers.utils.parseEther("100000"),
        BigNumber.from("0")
      );
    }

    // Need two checkpoints to get tokens fully distributed
    // Because tokens for current week are obtained in the next week
    // And that is by design
    await distributor.connect(admin).checkpointToken(stToken);
    await time.increase(WEEK * 2);
    await distributor.connect(admin).checkpointToken(stToken);

    for (const acct of accounts) {
      let tx = await distributor.connect(acct)["claim(address)"](stToken);
      let receipt = await tx.wait();
      userGases[acct.address] = userGases[acct.address].add(
        receipt.effectiveGasPrice.mul(receipt.gasUsed)
      );
    }

    const t0: number = (await distributor.startTime()).toNumber();
    const t1: number = Math.floor((await time.latest()) / WEEK) * WEEK;

    const tokensPerUserPerWeek: { [key: string]: BigNumber[] } = {};
    const tokensPerWeeks: BigNumber[] = [];

    for (let w = t0; w < t1 + WEEK; w += WEEK) {
      const tokensPerWeek = await distributor.tokensPerWeek(stToken, w);
      tokensPerWeeks.push(tokensPerWeek);

      for (const acct of accounts) {
        tokensPerUserPerWeek[acct.address] =
          tokensPerUserPerWeek[acct.address] || [];
        const tokens: BigNumber = tokensPerWeek
          .mul(await distributor.veForAt(acct.address, w))
          .div(await distributor.veSupply(w));
        tokensPerUserPerWeek[acct.address].push(tokens);
      }
    }

    const Token = await ethers.getContractFactory("MockToken");
    // Display results--------------------------------------------------
    // console.log(``);
    // console.log(`Results ------------------------>`);
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
    // console.log(`[Fees]`);
    // Object.entries(fees).forEach(([key, val]) => {
    //   console.log(`${key}: ${val}`);
    // });
    // console.log(``);
    // console.log(`[Total Fee]`);
    // console.log(totalFees.toString());
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
    // console.log(`[User balances changes without gas]`);
    // for (const acct of accounts) {
    //   console.log(
    //     acct.address,
    //     initialEthBalance[acct.address].toString(),
    //     (await ethers.provider.getBalance(acct.address))
    //       .sub(initialEthBalance[acct.address])
    //       .toString()
    //   );
    // }
    // console.log(``);
    // console.log(`[User balances changes with gas]`);
    // for (const acct of accounts) {
    //   console.log(
    //     acct.address,
    //     initialEthBalance[acct.address].toString(),
    //     (await ethers.provider.getBalance(acct.address))
    //       .sub(initialEthBalance[acct.address])
    //       .add(userGases[acct.address])
    //       .toString()
    //   );
    // }
    // console.log(``);
    // console.log(`[Coin balance of Distributor]`);
    // if (stToken === ethers.constants.AddressZero) {
    //   console.log(
    //     "Ether: ",
    //     (await ethers.provider.getBalance(distributor.address)).toString()
    //   );
    // } else {
    //   console.log(
    //     "Token: ",
    //     (await Token.attach(stToken).balanceOf(distributor.address)).toString()
    //   );
    // }

    // console.log(``);
    // -------------------------------------------

    for (const acct of accounts) {
      if (stToken === ethers.constants.AddressZero) {
        expect(await ethers.provider.getBalance(acct.address)).to.equal(
          tokensPerUserPerWeek[acct.address]
            .reduce(
              (a: BigNumber, b: BigNumber) => a.add(b),
              BigNumber.from("0")
            )
            .add(initialEthBalance[acct.address])
            .sub(userGases[acct.address])
        );
      } else {
        expect(await Token.attach(stToken).balanceOf(acct.address)).to.equal(
          tokensPerUserPerWeek[acct.address].reduce(
            (a: BigNumber, b: BigNumber) => a.add(b),
            BigNumber.from("0")
          )
        );
      }
    }

    // Check if all fees are distributed
    if (stToken === ethers.constants.AddressZero) {
      expect(await ethers.provider.getBalance(distributor.address)).to.be.lt(
        100
      );
    } else {
      expect(
        await Token.attach(stToken).balanceOf(distributor.address)
      ).to.be.lt(100);
    }
  }

  let func = [
    ruleNewLock,
    ruleExtendLock,
    ruleIncreaseLockAmount,
    ruleClaimFees,
    ruleTransferFees,
    ruleTransferFeesWithoutCheckpoint,
  ];

  for (let n = 0; n < FEE_TOKEN_NUM; n++) {
    for (let i = 0; i < MAX_EXAMPLES; i++) {
      it(`should distributes fee. Token: ${n}, Try: ${i}`, async () => {
        stToken = tokenAddresses[n];

        // Corresponds initializer initialize_new_lock and initialize_transfer_fees
        // https://eth-brownie.readthedocs.io/en/stable/tests-hypothesis-stateful.html#initializers
        // initialize_new_lock: This is equivalent to `rule_new_lock` to make it more likely we have at least 2 accounts locked at the start of the test run.
        // initialize_transfer_fees: This is equivalent to `rule_transfer_fees` to make it more likely that claimable fees are available from the start of the test.
        const initializerSeed = Math.random();
        if (initializerSeed < 0.2) {
          await ruleNewLock();
          await ruleTransferFees();
        } else if (initializerSeed < 0.4) {
          await ruleTransferFees();
          await ruleNewLock();
        } else if (initializerSeed < 0.6) {
          await ruleNewLock();
        } else if (initializerSeed < 0.8) {
          await ruleTransferFees();
        }

        const steps = randomValue(1, STATEFUL_STEP_COUNT);
        for (let x = 0; x < steps; x++) {
          let n = randomValue(0, func.length);
          await func[n]();
        }

        await teardown();
      });
    }
  }
});
