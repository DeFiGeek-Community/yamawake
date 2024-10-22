import { ethers } from "hardhat";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { YMWK } from "../../../../typechain-types";

describe("YMWK", function () {
  const YEAR = 365 * 24 * 60 * 60; // seconds in a year
  let accounts: SignerWithAddress[];
  let token: YMWK;
  let snapshot: SnapshotRestorer;
  ethers.getSigner;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    token = await ethers.deployContract("YMWK", []);
    await token.waitForDeployment();

    await time.increase(YEAR + 1);
    await token.updateMiningParameters();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("YMWK MintIntegration", function () {
    it("should mint the correct amount", async function () {
      const duration = YEAR; // Replace with dynamic value as needed
      await token.setMinter(accounts[0].address);
      const creationTime = await token.startEpochTime();
      const initialSupply = await token.totalSupply();
      const rate = await token.rate();

      await time.increase(duration);

      const currentTime = BigInt(await time.latest());
      const amount = (currentTime - creationTime) * rate;
      await token.mint(accounts[1].address, amount);

      expect(await token.balanceOf(accounts[1].address)).to.equal(amount);
      expect(await token.totalSupply()).to.equal(initialSupply + amount);
    });

    it("should revert on overmint", async function () {
      const duration = YEAR; // Replace with dynamic value as needed
      await token.setMinter(accounts[0].address);
      const creationTime = await token.startEpochTime();
      const rate = await token.rate();

      await time.increase(duration);

      const currentTime = BigInt(await time.latest());
      const amount = (currentTime - creationTime + 2n) * rate;
      await expect(token.mint(accounts[1].address, amount)).to.be.revertedWith(
        "dev: exceeds allowable mint amount"
      );
    });

    it("should mint multiple times correctly", async function () {
      await token.setMinter(accounts[0].address);
      let totalSupply = await token.totalSupply();
      let balance = BigInt(0);
      let epochStart = await token.startEpochTime();

      const durations = [YEAR * 0.33, YEAR * 0.5, YEAR * 0.7]; // Replace with dynamic values as needed

      for (const t of durations) {
        await time.increase(t);

        if (BigInt(await time.latest()) - epochStart > YEAR) {
          await token.updateMiningParameters();
          epochStart = await token.startEpochTime();
        }

        const amount = (await token.availableSupply()) - totalSupply;
        await token.mint(accounts[1].address, amount);

        balance = balance + BigInt(amount);
        totalSupply = totalSupply + amount;

        expect(await token.balanceOf(accounts[1].address)).to.equal(balance);
        expect(await token.totalSupply()).to.equal(totalSupply);
      }
    });
  });
});
