import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { sendEther } from "../../../scenarioHelper";

const DAY = 86400;
const WEEK = DAY * 7;

describe("FeeDistributor", () => {
  let admin: SignerWithAddress, alice: SignerWithAddress;
  let feeDistributor: Contract;
  let votingEscrow: Contract;
  let factory: Contract;
  let token: Contract;
  let coinA: Contract;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();

    [admin, alice] = await ethers.getSigners();

    const Distributor = await ethers.getContractFactory("FeeDistributor");
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

    feeDistributor = await Distributor.deploy(
      votingEscrow.address,
      factory.address,
      await time.latest(),
      alice.address,
      alice.address
    );
    await feeDistributor.deployed();
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_tokenCheckpoint", () => {
    // チェックポイントが週をまたぐ場合
    // 前回チェックポイントの翌週からの報酬の分配が始まることを確認
    it("test_tokenCheckpoint", async function () {
      const amount = ethers.utils.parseEther("1000");

      await token.transfer(alice.address, amount);
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));

      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);
      const startTime = await time.latest();
      await time.increase(WEEK * 5);

      const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime,
        admin.address,
        admin.address
      );
      await feeDistributor.deployed();

      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      const week1Timestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      await time.increase(WEEK);
      await sendEther(feeDistributor.address, "10", admin);

      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      const week2Timestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      const tokenPerWeek1 = await feeDistributor.tokensPerWeek(
        ethers.constants.AddressZero,
        week1Timestamp
      );
      const tokenPerWeek2 = await feeDistributor.tokensPerWeek(
        ethers.constants.AddressZero,
        week2Timestamp
      );
      expect(tokenPerWeek1).to.be.eq(0);
      expect(tokenPerWeek2).to.be.eq(ethers.utils.parseEther("10"));
    });

    // チェックポイントの間隔が20週間を超える場合の週ごとの報酬が
    // 直近20週間に均等に振り分けられていることを確認
    it("test_token_deposited_before", async function () {
      const fees: BigNumber[] = [];
      const amount = ethers.utils.parseEther("1000");

      await token.transfer(alice.address, amount);
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));

      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);
      const startTime = await time.latest();
      await time.increase(WEEK * 5);

      const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime,
        admin.address,
        admin.address
      );
      await feeDistributor.deployed();

      await feeDistributor.checkpointToken(ethers.constants.AddressZero);

      const localSnapshot = await takeSnapshot();

      await time.increase(WEEK * 30);
      await sendEther(feeDistributor.address, "10", admin);

      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      let latestWeekTimestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      let fee = BigNumber.from("0");
      for (let i = 0; i < 30; i++) {
        fee = await feeDistributor.tokensPerWeek(
          ethers.constants.AddressZero,
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
        // console.log(
        //   `WEEK ${i} ${Math.floor((latestWeekTimestamp - WEEK * i) / WEEK)}`,
        //   fee.toString()
        // );
      }

      await localSnapshot.restore();

      await time.increase(WEEK * 20);
      await sendEther(feeDistributor.address, "10", admin);

      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      latestWeekTimestamp = Math.floor((await time.latest()) / WEEK) * WEEK;

      fee = BigNumber.from("0");
      for (let i = 0; i < 21; i++) {
        fee = await feeDistributor.tokensPerWeek(
          ethers.constants.AddressZero,
          latestWeekTimestamp - WEEK * i
        );
        expect(fee).to.be.eq(fees[i]);
        // console.log(
        //   `WEEK ${i} ${Math.floor((latestWeekTimestamp - WEEK * i) / WEEK)}`,
        //   fee.toString()
        // );
      }
    });
  });
});
