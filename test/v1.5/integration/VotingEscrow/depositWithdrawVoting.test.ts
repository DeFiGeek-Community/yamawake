import { expect } from "chai";
import { ethers } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MockToken, VotingEscrow } from "../../../../typechain-types";

const ACCOUNT_NUM = 10;
const MAX_EXAMPLES = 30; // テストの試行回数
const STATEFUL_STEP_COUNT = 20; // ruleの実行回数
const YEAR = BigInt(86400 * 365);
const WEEK = BigInt(86400 * 7);
const ten_to_the_40 = BigInt("10000000000000000000000000000000000000000");

describe("VotingEscrow", function () {
  let accounts: SignerWithAddress[];
  let votingEscrow: VotingEscrow;
  let token: MockToken;

  let stAccountN: number;
  let stAccount: SignerWithAddress;
  let stValue: bigint = 0n;
  let stLockDuration: bigint;
  let votingBalances: { [key: string]: bigint }[];
  let unlockTime: bigint;

  let snapshot: SnapshotRestorer;

  beforeEach(async () => {
    snapshot = await takeSnapshot();
    accounts = (await ethers.getSigners()).slice(0, ACCOUNT_NUM);

    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");

    token = await Token.deploy("Test Token", "TST", 18);
    await token.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    //init
    for (let i = 0; i < ACCOUNT_NUM; i++) {
      await token
        .connect(accounts[i])
        ._mintForTesting(accounts[i].address, ten_to_the_40);
      await token
        .connect(accounts[i])
        .approve(votingEscrow.target, ethers.MaxUint256);
    }

    //setup
    votingBalances = new Array(ACCOUNT_NUM).fill({
      value: 0n,
      unlockTime: 0n,
    });
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  //--------------------------------------------- functions -----------------------------------------------------------//

  function rdmValue(a: number): bigint {
    let rdm = BigInt(Math.floor(Math.random() * a).toString());
    return rdm;
  }

  //--------------------------------------------- randomly excuted functions -----------------------------------------------------------//
  async function ruleCreateLock() {
    console.log("ruleCreateLock");

    //stAccount
    let rdm = Math.floor(Math.random() * 10); //0~9 integer
    stAccountN = rdm;
    stAccount = accounts[stAccountN];

    //stValue
    stValue = rdmValue(9007199254740991);

    //number of weeks to lock a deposit
    stLockDuration = rdmValue(255); //uint8.max

    let timestamp = BigInt(await time.latest());
    unlockTime = ((timestamp + WEEK * stLockDuration) / WEEK) * WEEK;

    if (stValue === 0n) {
      await expect(
        votingEscrow.connect(stAccount).createLock(stValue, unlockTime)
      ).to.revertedWith("need non-zero value");
    } else if (votingBalances[stAccountN]["value"] > 0) {
      await expect(
        votingEscrow.connect(stAccount).createLock(stValue, unlockTime)
      ).to.revertedWith("Withdraw old tokens first");
    } else if (unlockTime <= timestamp) {
      await expect(
        votingEscrow.connect(stAccount).createLock(stValue, unlockTime)
      ).to.revertedWith("Can only lock until time in the future");
    } else if (unlockTime >= timestamp + YEAR * 4n) {
      await expect(
        votingEscrow.connect(stAccount).createLock(stValue, unlockTime)
      ).to.revertedWith("Voting lock can be 4 years max");
    } else {
      const tx = await votingEscrow
        .connect(stAccount)
        .createLock(stValue, unlockTime);
      const receipt = await tx.wait();
      const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
      const iContract = VotingEscrow.interface;
      for (const log of receipt!.logs) {
        try {
          const parsedLog = iContract.parseLog(log);
          if (parsedLog?.name == `Deposit`) {
            const [, , locktime] = parsedLog?.args;
            votingBalances[stAccountN] = {
              value: stValue,
              unlockTime: locktime,
            };
            break;
          }
        } catch (error) {
          return "";
        }
      }
    }
  }

  async function ruleIncreaseAmount() {
    console.log("ruleIncreaseAmount");

    //stAccount
    let rdm = Math.floor(Math.random() * 10); //0~9 integer
    stAccountN = rdm;
    stAccount = accounts[stAccountN];

    //stValue
    stValue = rdmValue(9007199254740991);

    let timestamp = BigInt(await time.latest());

    if (stValue === 0n) {
      await expect(
        votingEscrow.connect(stAccount).increaseAmount(stValue)
      ).to.revertedWith("dev: need non-zero value");
    } else if (votingBalances[stAccountN]["value"] === 0n) {
      await expect(
        votingEscrow.connect(stAccount).increaseAmount(stValue)
      ).to.revertedWith("No existing lock found");
    } else if (votingBalances[stAccountN]["unlockTime"] <= timestamp) {
      await expect(
        votingEscrow.connect(stAccount).increaseAmount(stValue)
      ).to.revertedWith("Cannot add to expired lock. Withdraw");
    } else {
      await votingEscrow.connect(stAccount).increaseAmount(stValue);
      votingBalances[stAccountN]["value"] =
        votingBalances[stAccountN]["value"] + stValue;
    }
  }

  async function ruleIncreaseUnlockTime() {
    console.log("ruleIncreaseUnlockTime");

    //stAccount
    let rdm = Math.floor(Math.random() * 10); //0~9 integer
    stAccountN = rdm;
    stAccount = accounts[stAccountN];

    //unlockTime
    let timestamp = BigInt(await time.latest());
    stLockDuration = rdmValue(255); //number of weeks
    let unlockTime = ((timestamp + stLockDuration * WEEK) / WEEK) * WEEK;

    if (votingBalances[stAccountN]["unlockTime"] <= timestamp) {
      await expect(
        votingEscrow.connect(stAccount).increaseUnlockTime(unlockTime)
      ).to.revertedWith("Lock expired");
    } else if (votingBalances[stAccountN]["value"] === 0n) {
      await expect(
        votingEscrow.connect(stAccount).increaseUnlockTime(unlockTime)
      ).to.revertedWith("Nothing is locked");
    } else if (votingBalances[stAccountN]["unlockTime"] >= unlockTime) {
      await expect(
        votingEscrow.connect(stAccount).increaseUnlockTime(unlockTime)
      ).to.revertedWith("Can only increase lock duration");
    } else if (unlockTime > timestamp + YEAR * 4n) {
      await expect(
        votingEscrow.connect(stAccount).increaseUnlockTime(unlockTime)
      ).to.revertedWith("Voting lock can be 4 years max");
    } else {
      const tx = await votingEscrow
        .connect(stAccount)
        .increaseUnlockTime(unlockTime);
      const receipt = await tx.wait();
      const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
      const iContract = VotingEscrow.interface;
      for (const log of receipt!.logs) {
        try {
          const parsedLog = iContract.parseLog(log);
          if (parsedLog?.name == `Deposit`) {
            const [, , locktime] = parsedLog?.args!;
            votingBalances[stAccountN]["unlockTime"] = locktime;
            break;
          }
        } catch (error) {
          return "";
        }
      }
    }
  }

  async function ruleWithdraw() {
    console.log("ruleWithdraw");
    // Withdraw tokens from the voting escrow.

    //stAccount
    let rdm = Math.floor(Math.random() * 10); //0~9 integer
    stAccountN = rdm;
    stAccount = accounts[stAccountN];

    let timestamp = BigInt(await time.latest());

    if (votingBalances[stAccountN]["unlockTime"] > timestamp) {
      // console.log("--reverted");
      await expect(votingEscrow.connect(stAccount).withdraw()).to.revertedWith(
        "The lock didn't expire"
      );
    } else {
      await votingEscrow.connect(stAccount).withdraw();
      votingBalances[stAccountN]["value"] = 0n;
    }
  }

  async function ruleCheckpoint() {
    console.log("ruleCheckpoint");

    //stAccount
    let rdm = Math.floor(Math.random() * 10); //0~9 integer
    stAccountN = rdm;
    stAccount = accounts[stAccountN];

    await votingEscrow.connect(stAccount).checkpoint();
  }

  async function ruleAdvanceTime() {
    console.log("ruleAdvanceTime");

    let stSleepDuration = BigInt(Math.floor(Math.random() * 3) + 1); //1~4

    await time.increase(WEEK * stSleepDuration);
  }

  async function checkInvariants() {
    for (let i = 0; i < ACCOUNT_NUM; i++) {
      expect(await token.balanceOf(accounts[i].address)).to.equal(
        ten_to_the_40 - votingBalances[i]["value"]
      );
    }

    let total_supply = 0n;
    let timestamp = BigInt(await time.latest());

    for (let i = 0; i < ACCOUNT_NUM; i++) {
      let data = votingBalances[i];

      let balance = await votingEscrow["balanceOf(address)"](
        accounts[i].address
      );
      total_supply = total_supply + balance;

      if (data["unlockTime"] > timestamp && data["value"] / YEAR > 0) {
        expect(balance === 0n).to.equal(false);
      } else if (data["value"] === 0n || data["unlockTime"] >= timestamp) {
        expect(balance === 0n).to.equal(true);
      }
    }
    expect(await votingEscrow["totalSupply()"]()).to.equal(total_supply);

    total_supply = 0n;
    let blocknumber = (await time.latestBlock()) - 4;

    for (let i = 0; i < ACCOUNT_NUM; i++) {
      total_supply =
        total_supply +
        (await votingEscrow.balanceOfAt(accounts[i].address, blocknumber));
    }

    expect(await votingEscrow.totalSupplyAt(blocknumber)).to.equal(
      total_supply
    );
  }

  let func = [
    ruleCreateLock,
    ruleIncreaseAmount,
    ruleIncreaseUnlockTime,
    ruleWithdraw,
    ruleCheckpoint,
    ruleAdvanceTime,
  ];

  //set arbitral number of repeats
  for (let x = 0; x < MAX_EXAMPLES; x++) {
    it(`Try ${x}`, async () => {
      let steps = Math.floor(Math.random() * (STATEFUL_STEP_COUNT - 1)) + 1;
      for (let i = 0; i < steps; i++) {
        let n = Number(rdmValue(func.length));
        await func[n]();
        await checkInvariants();
      }
    });
  }
});
