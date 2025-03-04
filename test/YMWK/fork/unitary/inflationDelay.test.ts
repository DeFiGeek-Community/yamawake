import { ethers } from "hardhat";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import Constants from "../../../lib/Constants";
import { YMWK } from "../../../../typechain-types";

describe("YMWK", function () {
  let accounts: SignerWithAddress[];
  let token: YMWK;
  let snapshot: SnapshotRestorer;

  const YEAR = Constants.YEAR;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    const Token = await ethers.getContractFactory("YMWK");
    token = await Token.deploy();
    await token.waitForDeployment();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("YMWK InflationDelay", function () {
    it("test_rate", async function () {
      expect(await token.rate()).to.equal(0);

      await ethers.provider.send("evm_increaseTime", [Number(YEAR + 1n)]);
      await ethers.provider.send("evm_mine", []);

      await token.updateMiningParameters();

      expect(await token.rate()).to.be.gt(0);
    });

    it("test_startEpochTime", async function () {
      const creationTime = await token.startEpochTime();

      await ethers.provider.send("evm_increaseTime", [Number(YEAR + 1n)]);
      await ethers.provider.send("evm_mine", []);

      await token.updateMiningParameters();

      expect(await token.startEpochTime()).to.equal(creationTime + YEAR);
    });

    it("test_miningEpoch", async function () {
      expect(await token.miningEpoch()).to.equal(-1);

      await ethers.provider.send("evm_increaseTime", [Number(YEAR + 1n)]);
      await ethers.provider.send("evm_mine", []);

      await token.updateMiningParameters();

      expect(await token.miningEpoch()).to.equal(0);
    });

    it("test_availableSupply", async function () {
      expect(await token.availableSupply()).to.equal(
        ethers.parseEther("450000000")
      );

      await ethers.provider.send("evm_increaseTime", [Number(YEAR + 1n)]);
      await ethers.provider.send("evm_mine", []);

      await token.updateMiningParameters();

      expect(await token.availableSupply()).to.be.gt(
        ethers.parseEther("450000000")
      );
    });
  });
});
