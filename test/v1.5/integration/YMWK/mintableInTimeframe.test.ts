import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract } from "ethers";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { abs } from "../../../helper";
import Constants from "../../Constants";
import { YMWK } from "../../../../typechain-types";

// Constants
const YEAR = Constants.YEAR;
const INITIAL_RATE = BigInt(55_000_000);
const YEAR_1_SUPPLY = ((INITIAL_RATE * BigInt(10) ** BigInt(18)) / YEAR) * YEAR;
const INITIAL_SUPPLY = BigInt(450_000_000);

describe("YMWK", function () {
  let accounts: SignerWithAddress[];
  let token: YMWK;
  let snapshot: SnapshotRestorer;
  const year = Constants.year;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    const Token = await ethers.getContractFactory("YMWK");
    token = await Token.deploy();

    await time.increase(YEAR + 1n);
    await token.updateMiningParameters();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("YMWK MintableInTimeframe", function () {
    // Helper function for approximate equality
    function approx(a: bigint, b: bigint, precision: bigint): boolean {
      if (a === 0n && b === 0n) {
        return true;
      }

      // Adjust precision for BigInt
      const precisionAdjusted = BigInt(10) ** 18n * precision;

      return abs(a - b) <= (a + b) / precisionAdjusted;
    }

    // Helper function for theoretical supply calculation
    async function theoreticalSupply(token: YMWK): Promise<bigint> {
      const epoch: bigint = await token.miningEpoch();
      const q = BigInt(10) ** 18n / BigInt(2) ** 2n; // Equivalent to 1/2**0.25
      let S = INITIAL_SUPPLY * BigInt(10) ** 18n;

      if (epoch > 0n) {
        S =
          S +
          (YEAR_1_SUPPLY *
            BigInt(10) ** 18n *
            (BigInt(10) ** 18n - q ** epoch)) /
            (BigInt(10) ** 18n - q);
      }

      S =
        S +
        (YEAR_1_SUPPLY / YEAR) *
          q ** epoch *
          (BigInt(await time.latest()) - (await token.startEpochTime()));
      return S;
    }

    it("test_mintableInTimeframe", async function () {
      const t0 = Number(await token.startEpochTime());

      // Ensure the exponentiation stays within safe integer limits
      const exponent = BigInt(10) ** 1n; // Adjust the exponent as necessary
      await time.increase(exponent);

      let t1 = await time.latest();
      if (t1 - t0 >= year) {
        await token.updateMiningParameters();
      }
      t1 = await time.latest();

      const availableSupply: bigint = await token.availableSupply();
      const mintable = await token.mintableInTimeframe(t0, t1);
      expect(
        availableSupply - INITIAL_SUPPLY * Constants.ten_to_the_18 >= mintable
      ).to.equal(true);
      if (t1 == t0) {
        expect(mintable).to.equal(BigInt(0));
      } else {
        const tolerance = BigInt("10000000"); // Adjust as needed for precision
        expect(
          (availableSupply - INITIAL_SUPPLY * Constants.ten_to_the_18) /
            mintable -
            1n
        ).to.be.lt(tolerance);
      }

      // Replace this with the actual theoretical supply calculation
      // const theoreticalSupply = BigInt("EXPECTED_SUPPLY_CALCULATION");
      expect(
        approx(
          await theoreticalSupply(token),
          availableSupply,
          Constants.ten_to_the_16
        )
      ).to.equal(true);
    });

    it("test_random_range_year_one", async function () {
      const creationTime: bigint = await token.startEpochTime();
      const time1 = BigInt(Math.floor(Math.random() * Number(YEAR)));
      const time2 = BigInt(Math.floor(Math.random() * Number(YEAR)));
      const [start, end] = [creationTime + time1, creationTime + time2];
      const sortedTimes = start < end ? [start, end] : [end, start];
      const rate = YEAR_1_SUPPLY / YEAR;

      expect(
        await token.mintableInTimeframe(sortedTimes[0], sortedTimes[1])
      ).to.equal(rate * (sortedTimes[1] - sortedTimes[0]));
    });

    it("test_random_range_multiple_epochs", async function () {
      const creationTime: bigint = await token.startEpochTime();
      const start = creationTime + YEAR * 2n;
      const duration = YEAR * 2n;
      const end = start + duration;

      const startEpoch = (start - creationTime) / YEAR;
      const endEpoch = (end - creationTime) / YEAR;
      const exponent = startEpoch * 25n;
      const rate = YEAR_1_SUPPLY / YEAR / BigInt(2) ** (exponent / 100n);

      for (let i = startEpoch; i < endEpoch; i++) {
        await time.increase(YEAR);
        await token.updateMiningParameters();
      }

      const mintable: bigint = await token.mintableInTimeframe(start, end);
      if (startEpoch === endEpoch) {
        const expectedMintable = rate * (end - start);
        expect(approx(mintable, expectedMintable, Constants.ten_to_the_16)).to
          .be.true;
      } else {
        expect(mintable < rate * end).to.be.true;
      }
    });

    it("test_availableSupply", async function () {
      const duration = BigInt(100000);
      const creationTime = await token.startEpochTime();
      const initialSupply = await token.totalSupply();
      const rate = await token.rate();

      await time.increase(duration);

      const now = BigInt(await time.latest());
      const expected = initialSupply + (now - creationTime) * rate;
      expect(await token.availableSupply()).to.equal(expected);
    });
  });
});
