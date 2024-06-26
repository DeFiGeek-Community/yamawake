import { ethers } from "hardhat";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import Constants from "../../Constants";

describe("YMWK", function () {
  let accounts: SignerWithAddress[];
  let token: Contract;
  let snapshot: SnapshotRestorer;

  const week = Constants.week;
  const YEAR = Constants.YEAR;
  const year = Constants.year;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    const Token = await ethers.getContractFactory("YMWK");
    token = await Token.deploy();
    await token.deployed();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("YMWK EpochTimeSupply", function () {
    it("test_startEpochTimeWrite", async function () {
      const creationTime: BigNumber = await token.startEpochTime();
      await ethers.provider.send("evm_increaseTime", [year]);
      await ethers.provider.send("evm_mine", []);

      expect(await token.startEpochTime()).to.equal(creationTime);

      await token.startEpochTimeWrite();

      expect(await token.startEpochTime()).to.equal(creationTime.add(YEAR));
    });

    it("test_startEpochTimeWrite_same_epoch", async function () {
      await token.startEpochTimeWrite();
      await token.startEpochTimeWrite();
    });

    it("test_updateMiningParameters", async function () {
      const creationTime = await token.startEpochTime();
      const now = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp,
      );
      const newEpoch = creationTime.add(YEAR).sub(now);
      await ethers.provider.send("evm_increaseTime", [newEpoch.toNumber()]);
      await token.updateMiningParameters();
    });

    it("test_updateMiningParameters_same_epoch", async function () {
      const creationTime = await token.startEpochTime();
      const now = BigNumber.from(
        (await ethers.provider.getBlock("latest")).timestamp,
      );
      const newEpoch = creationTime.add(YEAR).sub(now);
      await ethers.provider.send("evm_increaseTime", [
        newEpoch.sub(BigNumber.from("3")).toNumber(),
      ]);
      await expect(token.updateMiningParameters()).to.be.revertedWith(
        "dev: too soon!",
      );
    });

    it("test_mintableInTimeframe_end_before_start", async function () {
      const creationTime = await token.startEpochTime();
      await expect(
        token.mintableInTimeframe(creationTime.add(1), creationTime),
      ).to.be.revertedWith("dev: start > end");
    });

    it("test_mintableInTimeframe_multiple_epochs", async function () {
      const creationTime = await token.startEpochTime();

      // Two epochs should not raise
      const mintable = BigNumber.from("19").div(BigNumber.from("10"));
      await token.mintableInTimeframe(
        creationTime,
        creationTime
          .add(YEAR)
          .mul(BigNumber.from("19").div(BigNumber.from("10"))),
      );

      // Three epochs should raise
      await expect(
        token.mintableInTimeframe(
          creationTime,
          creationTime
            .add(YEAR)
            .mul(BigNumber.from("21").div(BigNumber.from("10"))),
        ),
      ).to.be.revertedWith("dev: too far in future");
    });

    it("test_availableSupply", async function () {
      const creationTime = await token.startEpochTime();
      const initialSupply = await token.totalSupply();
      const rate = await token.rate();
      await ethers.provider.send("evm_increaseTime", [week]);

      const latestBlock = await ethers.provider.getBlock("latest");
      const currentTime = BigNumber.from(latestBlock.timestamp);

      const timeElapsed = currentTime.sub(creationTime);
      const expected = initialSupply.add(timeElapsed.mul(rate));

      expect(await token.availableSupply()).to.equal(expected);
    });
  });
});
