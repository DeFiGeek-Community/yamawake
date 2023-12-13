import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { deploySaleTemplateV1_5 } from "../../../scenarioHelper";

const ACCOUNT_NUM = 5;
const MAX_EXAMPLES = 30;
const STATEFUL_STEP_COUNT = 30;
const DAY = 86400;
const WEEK = DAY * 7;
const YEAR = DAY * 365;
const two_to_the_256_minus_1 = BigNumber.from("2")
  .pow(BigNumber.from("256"))
  .sub(BigNumber.from("1"));
const MOUNT_DECIMALS = 3;

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
  // Corresponds strategy("address", length=5)
  let rdm = Math.floor(Math.random() * ACCOUNT_NUM); //0~9 integer
  return rdm;
}
function getRandomWeeks(): BigNumber {
  // Corresponds strategy("uint256", min_value=1, max_value=12)
  return randomBigValue(1, 12);
}
function getRandomAmounts(): BigNumber {
  // Corresponds strategy("decimal", min_value=1, max_value=100, places=3)
  return randomBigValue(
    1 * 10 ** MOUNT_DECIMALS,
    100 * 10 ** MOUNT_DECIMALS
  ).mul(BigNumber.from(10).pow(18 - MOUNT_DECIMALS));
}
function getRandomsTime(): BigNumber {
  return randomBigValue(0, WEEK * 2);
}
function getRandomAuctionDuration(): number {
  return randomValue(DAY, DAY * 3);
}
// ------------------------------------------------
/* 
Template v1.5, FeeDistributor, VotingEscrowのインテグレーションテスト
以下をランダムな順序で繰り返し、FeeDistributorに記録される週ごとの報酬額の合計とそれぞれアカウントの最終的な残高の変化が一致していることを確認する
- ランダムな開催期間、トークン額にてオークションを開催
- ランダムな額をlock, extendLock, increaseAmount、withdraw
- ランダムな額を入札
- 終了したオークションの売上回収orトークン回収
- 報酬のクレーム
*/
describe("TemplateV1.5", function () {
  let accounts: SignerWithAddress[];
  let admin: SignerWithAddress; // FeeDistributor Admin
  let votingEscrow: Contract;
  let factory: Contract;
  let distributor: Contract;
  let feeCoin: Contract;
  let token: Contract;
  let auction: Contract;

  let lockedUntil: { [key: string]: number } = {};
  let fees: { [key: number]: BigNumber } = {}; // timestamp -> amount
  let userClaims: { [key: string]: { [key: number]: BigNumber } } = {}; // address -> timestamp -> [claimed, timeCursor]
  let userGases: { [key: string]: BigNumber }; // address -> total gas fee
  let contributions: { [key: string]: BigNumber }; // address -> total contribution
  let initialEthBalance: { [key: string]: BigNumber };
  let totalFees: BigNumber = ethers.utils.parseEther("0");
  let auctions: Contract[];
  let activeAuctions: Contract[];
  let veEventsbyUser: { [key: string]: { [key: number]: string } };
  let templateName: string;

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
    contributions = {};
    totalFees = ethers.utils.parseEther("0");

    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
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

      userClaims[accounts[i].address] = {};
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
      await time.latest(),
      admin.address,
      admin.address
    );
    await distributor.deployed();

    await feeCoin
      .connect(admin)
      ._mintForTesting(admin.address, ethers.utils.parseEther("1"));
    await feeCoin
      .connect(admin)
      .approve(factory.address, ethers.utils.parseEther("1"));
    let auctionObj = await deploySaleTemplateV1_5(
      factory,
      distributor,
      token,
      feeCoin.address,
      ethers.utils.parseEther("1"),
      (await time.latest()) + DAY,
      DAY,
      0,
      admin
    );
    templateName = auctionObj.templateName;

    auctions = [];
    activeAuctions = [];

    for (let i = 0; i < ACCOUNT_NUM; i++) {
      initialEthBalance[accounts[i].address] = await accounts[i].getBalance();
      userGases[accounts[i].address] = ethers.BigNumber.from("0");
      contributions[accounts[i].address] = ethers.BigNumber.from("0");
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
    }, stAmount: ${stAmount.toString()}, stWeeks: ${stWeeks.toString()}, stTime: ${stTime.toString()}
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
    }, stWeeks: ${stWeeks.toString()}, stTime: ${stTime.toString()}
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
    stAcct = accounts[getRandomAccountNum()];
    stAmount = getRandomAmounts();
    stTime = getRandomsTime();

    console.log(`
    ruleIncreaseLockAmount --- stAmount ${
      stAcct.address
    }, stAmount: ${stAmount.toString()}, stTime: ${stTime.toString()}
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

  async function ruleContribute(
    stAcct?: SignerWithAddress,
    stAmount?: BigNumber,
    stAuctionId?: number,
    stTime?: BigNumber
  ) {
    /*
    Contribute to an active auction.

    Arguments
    ---------
    stAcct : SignerWithAddress
        Account to claim fees for.
    stAmount: BigNumber
        Amount of tokens to contribute.
    stAuctionId: number
        Auction ID to contribute.
    stTime : number
        Duration to sleep before action, in seconds.
    */
    if (activeAuctions.length === 0) {
      await ruleStartAuction();
      return;
    }
    stAcct = accounts[getRandomAccountNum()];
    stAmount = stAmount || getRandomAmounts();
    stAuctionId = stAuctionId || randomValue(0, activeAuctions.length);
    stTime = stTime || getRandomsTime();
    auction = activeAuctions[stAuctionId];

    const closingAt = await auction.closingAt();

    if (closingAt.toNumber() <= (await time.latest())) {
      // オークションは終了している
      await ruleCloseAuction(stAuctionId);
      return;
    }
    const startingAt = await auction.startingAt();
    if (startingAt.toNumber() > (await time.latest())) {
      await time.increaseTo(startingAt);
    }

    console.log(`
    ruleContribute --- stAcct ${
      stAcct.address
    }, stAmount ${stAmount.toString()}, stAuctionId: ${stAuctionId}, stTime: ${stTime.toString()}
    `);

    const tx = await stAcct.sendTransaction({
      to: auction.address,
      value: stAmount,
    });
    const receipt = await tx.wait();
    userGases[stAcct.address] = userGases[stAcct.address].add(
      receipt.effectiveGasPrice.mul(receipt.gasUsed)
    );
    contributions[stAcct.address] = contributions[stAcct.address].add(stAmount);

    stTime.gt(0) && (await time.increase(stTime));
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
    ruleClaimFees --- stAcct ${stAcct.address}, stTime: ${stTime.toString()}
    `);

    stTime.gt(0) && (await time.increase(stTime));

    // For debug ---
    // const t0: number = (await distributor.startTime()).toNumber();
    // const ue = await distributor.userEpochOf(stAcct.address);
    // const up = await votingEscrow.userPointHistory(stAcct.address, ue);
    // console.log(`Week:
    //     ${Math.floor(((await time.latest()) - t0) / WEEK)}

    //     Point: ${up}
    //     `);
    // ---

    const claimed = await ethers.provider.getBalance(stAcct.address);
    const tx = await distributor
      .connect(stAcct)
      ["claim(address)"](ethers.constants.AddressZero);
    const receipt = await tx.wait();
    const gas = receipt.effectiveGasPrice.mul(receipt.gasUsed);
    userGases[stAcct.address] = userGases[stAcct.address].add(gas);

    const newClaimed = (await ethers.provider.getBalance(stAcct.address))
      .sub(claimed)
      .add(gas);
    userClaims[stAcct.address][tx.blockNumber] = newClaimed;
  }

  async function ruleStartAuction(
    stAmount?: BigNumber,
    stAuctionDuration?: number,
    stTime?: BigNumber
  ) {
    /*
    Start a new auction with random amount and duration.

    Arguments
    ---------
    stAmount : BigNumber
        Amount of fee tokens to add to the distributor.
    stAuctionDuration : number
        Event duration
    stTime : number
        Duration to sleep before action, in seconds.
    */
    stAmount = stAmount || getRandomAmounts();
    stAuctionDuration = stAuctionDuration || getRandomAuctionDuration();
    stTime = stTime || getRandomsTime();

    console.log(`
    ruleStartAuction --- stAmount ${stAmount.toString()}, stAuctionDuration ${
      stAuctionDuration / (3600 * 24)
    } days,  stTime: ${stTime.toString()}
    `);

    stTime.gt(0) && (await time.increase(stTime));

    await feeCoin.connect(admin)._mintForTesting(admin.address, stAmount);
    await feeCoin.connect(admin).approve(factory.address, stAmount);

    const abiCoder = ethers.utils.defaultAbiCoder;
    const args = abiCoder.encode(
      ["address", "uint256", "uint256", "address", "uint256", "uint256"],
      [
        admin.address,
        (await time.latest()) + DAY,
        stAuctionDuration,
        feeCoin.address,
        stAmount,
        0, //randomBigValue(0, 5).mul(BigNumber.from(10).pow(18)),
      ]
    );
    const tx = await factory.connect(admin).deployAuction(templateName, args);
    const receipt = await tx.wait();
    const event = receipt.events.find(
      (event: any) => event.event === "Deployed"
    );
    const [, templateAddr] = event.args;
    const Template = await ethers.getContractFactory("TemplateV1_5");
    const auction = Template.attach(templateAddr);

    auctions.push(auction);
    activeAuctions.push(auction);
  }

  async function ruleCloseAuction(stAuctionId?: number, stTime?: BigNumber) {
    /*
    オークションが開催終了していた場合
        - 売上引き出し（成功）
        - トークン回収（失敗）
    Arguments
    ---------
    stAuctionId : BigNumber
        Amount of fee tokens to add to the distributor.
    stTime : number
        Duration to sleep before action, in seconds.
    */
    if (activeAuctions.length === 0) {
      return;
    }
    stAuctionId = stAuctionId || randomValue(0, activeAuctions.length);
    stTime = stTime || getRandomsTime();
    auction = activeAuctions[stAuctionId];

    console.log(`
    ruleCloseAuction --- stAuctionId ${stAuctionId}
    `);

    stTime.gt(0) && (await time.increase(stTime));

    const closingAt = await auction.closingAt();

    if (closingAt.toNumber() > (await time.latest())) {
      // オークションはまだ開催中
      return;
    }
    const minRaisedAmount = await auction.minRaisedAmount();
    const totalRaised = await auction.totalRaised();

    if (minRaisedAmount.gt(totalRaised) || totalRaised.eq(0)) {
      // 失敗。トークン回収
      await auction.connect(admin).withdrawERC20Onsale();
    } else {
      // 成功、売上回収
      const raised = await auction.totalRaised();
      await auction.connect(admin).withdrawRaisedETH();
      totalFees = totalFees.add(raised.div(100));
    }
    // 開催中オークションリストから削除
    activeAuctions.splice(stAuctionId, 1);
  }

  async function teardown() {
    /*
    Claim fees for all accounts and verify that only dust remains.
    */
    console.log("teardown----");
    for (let i = 0; i < activeAuctions.length; i++) {
      // 開催中のオークションがある場合、期限が過ぎているものはクローズする
      await ruleCloseAuction(i, BigNumber.from("0"));
    }

    // Need two checkpoints to get tokens fully distributed
    // Because tokens for current week are obtained in the next week
    // And that is by design
    await distributor
      .connect(admin)
      .checkpointToken(ethers.constants.AddressZero);
    await ethers.provider.send("evm_increaseTime", [WEEK * 2]);
    await distributor
      .connect(admin)
      .checkpointToken(ethers.constants.AddressZero);

    for (const acct of accounts) {
      // For debug --->
      //   const t0: number = (await distributor.startTime()).toNumber();
      //   const ue = await distributor.userEpochOf(acct.address);
      //   const up = await votingEscrow.userPointHistory(acct.address, ue);
      //   console.log(`Week:
      //     ${Math.floor(((await time.latest()) - t0) / WEEK)}

      //     Point: ${up}
      //     `);
      // <----
      try {
        // veSupplyの同期が20週間以上遅れていると0 divisionエラーでrevert
        await ruleClaimFees(acct, BigNumber.from("0"));
        // console.log(
        //   (await distributor.timeCursor()).div(WEEK).toString(),
        //   Math.floor((await time.latest()) / WEEK)
        // );
      } catch (e: any) {
        // RevertしたTXのガスコストを考慮
        const latestBlock = await ethers.provider.getBlock("latest");
        const latestTXHash = latestBlock.transactions.at(-1);
        const revertedTxReceipt = await ethers.provider.getTransactionReceipt(
          latestTXHash as string
        );
        const revertedTxGasUsage = revertedTxReceipt.gasUsed;
        const revertedTxGasPrice = revertedTxReceipt.effectiveGasPrice;
        const revertedTxGasCosts = revertedTxGasUsage.mul(revertedTxGasPrice);
        userGases[acct.address] =
          userGases[acct.address].add(revertedTxGasCosts);

        // revertは仕様とし、checkpointTotalSupplyを呼び、再度claimする
        await distributor.connect(admin).checkpointTotalSupply();
        await ruleClaimFees(acct, BigNumber.from("0"));
        // throw e;
      }
      const thisWeek = Math.floor((await time.latest()) / WEEK) * WEEK;
      let userTimeCursor = await distributor.timeCursorOf(
        acct.address,
        ethers.constants.AddressZero
      );
      if (userTimeCursor.gt(0) && userTimeCursor.lt(thisWeek)) {
        // console.log(
        //   `Additional claim. ${BigNumber.from(thisWeek).sub(userTimeCursor).div(WEEK)}`
        // );
        // 追加でClaim。2回で十分
        await ruleClaimFees(acct, BigNumber.from("0"));
        await ruleClaimFees(acct, BigNumber.from("0"));
      }
    }

    const t0: number = (await distributor.startTime()).toNumber();
    const t1: number = Math.floor((await time.latest()) / WEEK) * WEEK;

    const tokensPerUserPerWeek: { [key: string]: BigNumber[] } = {};
    const tokensPerWeeks: BigNumber[] = [];

    for (let w = t0; w < t1 + WEEK; w += WEEK) {
      const tokensPerWeek = await distributor.tokensPerWeek(
        ethers.constants.AddressZero,
        w
      );
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

    // Display results--------------------------------------------------
    console.log(``);
    console.log(`Results ------------------------>`);
    console.log(`[TokensPerWeek]`);
    Object.entries(tokensPerWeeks).forEach((val) => {
      console.log(`${val.toString()}`);
    });
    console.log(``);
    console.log(`[TokensPerUserPerWeek]`);
    Object.entries(tokensPerUserPerWeek).forEach(([key, val]) => {
      console.log(`${key}: ${val}`);
    });
    console.log(``);
    console.log(`[Fees]`);
    Object.entries(fees).forEach(([key, val]) => {
      console.log(`${key}: ${val}`);
    });
    console.log(``);
    console.log(`[Total Fee]`);
    console.log(totalFees.toString());
    console.log(``);
    console.log(`[User claims]`);
    Object.entries(userClaims).forEach(([key, val]) => {
      console.log(`${key}:`);
      Object.entries(val).forEach(([k, v]) => {
        console.log(`${k}: ${v}`);
      });
      console.log(``);
    });
    console.log(``);
    console.log(`[User balances changes without gas]`);
    for (const acct of accounts) {
      console.log(
        acct.address,
        initialEthBalance[acct.address].toString(),
        (await ethers.provider.getBalance(acct.address))
          .sub(initialEthBalance[acct.address])
          .toString()
      );
    }
    console.log(``);
    console.log(`[User balances changes with gas]`);
    for (const acct of accounts) {
      console.log(
        acct.address,
        initialEthBalance[acct.address].toString(),
        (await ethers.provider.getBalance(acct.address))
          .sub(initialEthBalance[acct.address])
          .add(userGases[acct.address])
          .toString()
      );
    }
    console.log(``);
    console.log(`[Ether balance of Distributor]`);
    console.log(
      (await ethers.provider.getBalance(distributor.address)).toString()
    );

    console.log(``);
    console.log(`[Active auctions]`);
    console.log(`Number of active auctions: ${activeAuctions.length}`);
    for (let i = 0; i < auctions.length; i++) {
      const startWeek = (await auctions[i].startingAt()).sub(t0).div(WEEK);
      const endWeek = (await auctions[i].closingAt()).sub(t0).div(WEEK);
      const totalRaised = await auctions[i].totalRaised();
      console.log(
        `Auction ${i}: startWeek: ${startWeek} closeWeek: ${endWeek} raised: ${totalRaised.toString()}`
      );
    }
    console.log(`<------------------------ End of Results`);
    console.log(``);
    // -------------------------------------------

    for (const acct of accounts) {
      // 各アカウントの初期残高からの変化がそれぞれの報酬額と合致していることを確認
      expect(await ethers.provider.getBalance(acct.address)).to.equal(
        tokensPerUserPerWeek[acct.address]
          .reduce((a: BigNumber, b: BigNumber) => a.add(b), BigNumber.from("0"))
          .add(initialEthBalance[acct.address])
          .sub(userGases[acct.address])
          .sub(contributions[acct.address])
      );
    }

    // Check if all fees are distributed
    expect(await ethers.provider.getBalance(distributor.address)).to.be.lt(100);
  }

  let func = [
    ruleNewLock,
    ruleExtendLock,
    ruleIncreaseLockAmount,
    ruleContribute,
    ruleStartAuction,
    ruleCloseAuction,
    ruleClaimFees,
  ];

  describe("test_deposit_withdraw_voting", function () {
    for (let i = 0; i < MAX_EXAMPLES; i++) {
      it(`should distributes fee. Try: ${i}`, async () => {
        // Lock YMWK initially at a certain probability
        const initializerSeed = Math.random();
        if (initializerSeed < 0.2) {
          await ruleNewLock();
          await ruleStartAuction();
        } else if (initializerSeed < 0.4) {
          await ruleStartAuction();
          await ruleNewLock();
        } else if (initializerSeed < 0.6) {
          await ruleNewLock();
        } else if (initializerSeed < 0.8) {
          await ruleStartAuction();
        }

        const contributionSeed = Math.random();
        if (contributionSeed < 0.5) {
          await ruleContribute();
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
});
