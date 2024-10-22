import { ethers } from "hardhat";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import Constants from "../../../lib/Constants";
import { YMWK } from "../../../../typechain-types";

describe("YMWK", function () {
  let accounts: SignerWithAddress[];
  let token: YMWK;
  let snapshot: SnapshotRestorer;

  const week = Constants.week;
  const YEAR = Constants.YEAR;
  const year = Constants.year;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    token = await ethers.deployContract("YMWK", []);
    await token.waitForDeployment();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("YMWK EpochTimeSupply", function () {
    it("test_startEpochTimeWrite", async function () {
      const creationTime = await token.startEpochTime();
      await ethers.provider.send("evm_increaseTime", [year]);
      await ethers.provider.send("evm_mine", []);

      expect(await token.startEpochTime()).to.equal(creationTime);

      await token.startEpochTimeWrite();

      expect(await token.startEpochTime()).to.equal(creationTime + YEAR);
    });

    it("test_startEpochTimeWrite_same_epoch", async function () {
      await token.startEpochTimeWrite();
      await token.startEpochTimeWrite();
    });

    it("test_updateMiningParameters", async function () {
      const creationTime = await token.startEpochTime();
      const now = BigInt(await time.latest());
      const newEpoch = creationTime + YEAR - now;
      await ethers.provider.send("evm_increaseTime", [Number(newEpoch)]);
      await token.updateMiningParameters();
    });

    it("test_updateMiningParameters_same_epoch", async function () {
      const creationTime = await token.startEpochTime();
      const now = BigInt(await time.latest());
      const newEpoch = creationTime + YEAR - now;
      await ethers.provider.send("evm_increaseTime", [
        Number(newEpoch - BigInt("3")),
      ]);
      await expect(token.updateMiningParameters()).to.be.revertedWith(
        "dev: too soon!"
      );
    });

    it("test_mintableInTimeframe_end_before_start", async function () {
      const creationTime = await token.startEpochTime();
      await expect(
        token.mintableInTimeframe(creationTime + 1n, creationTime)
      ).to.be.revertedWith("dev: start > end");
    });

    it("test_mintableInTimeframe_multiple_epochs", async function () {
      const creationTime = await token.startEpochTime();

      // Two epochs should not raise
      const mintable = BigInt("19") / BigInt("10");
      await token.mintableInTimeframe(
        creationTime,
        (creationTime + YEAR) * (BigInt("19") / BigInt("10"))
      );

      // Three epochs should raise
      await expect(
        token.mintableInTimeframe(
          creationTime,
          (creationTime + YEAR) * (BigInt("21") / BigInt("10"))
        )
      ).to.be.revertedWith("dev: too far in future");
    });

    it("test_availableSupply", async function () {
      const creationTime = await token.startEpochTime();
      const initialSupply = await token.totalSupply();
      const rate = await token.rate();
      await ethers.provider.send("evm_increaseTime", [week]);

      const currentTime = BigInt(await time.latest());

      const timeElapsed = currentTime - creationTime;
      const expected = initialSupply + timeElapsed * rate;

      expect(await token.availableSupply()).to.equal(expected);
    });
  });
});
