import { ethers } from "hardhat";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import Constants from "../../Constants";

describe("YMWK", function () {
  let accounts: SignerWithAddress[];
  let token: Contract;
  let snapshot: SnapshotRestorer;

  const week = Constants.week;
  const year = Constants.YEAR;
  const ZERO_ADDRESS = Constants.ZERO_ADDRESS;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();
    const Token = await ethers.getContractFactory("YMWK");
    token = await Token.deploy();
    await ethers.provider.send("evm_increaseTime", [Number(year + 1n)]);
    await token.updateMiningParameters();
  });

  afterEach(async () => {
    await snapshot.restore();
  });
  describe("YMWK Mint", function () {
    it("test_availableSupply", async function () {
      const creationTime = await token.startEpochTime();
      const initialSupply = await token.totalSupply();
      const rate = await token.rate();

      await ethers.provider.send("evm_increaseTime", [week]);
      await ethers.provider.send("evm_mine", []);

      const currentBlock = BigInt(await time.latest());
      const expected = initialSupply + (currentBlock - creationTime) * rate;
      expect(await token.availableSupply()).to.equal(expected);
    });

    it("test_mint", async function () {
      await token.setMinter(accounts[0].address);
      const creationTime = await token.startEpochTime();
      const initialSupply = await token.totalSupply();
      const rate = await token.rate();

      await ethers.provider.send("evm_increaseTime", [week]);

      const currentTime = BigInt(await time.latest());
      const amount = (currentTime - creationTime) * rate;
      await token.mint(accounts[1].address, amount);

      expect(await token.balanceOf(accounts[1].address)).to.equal(amount);
      expect(await token.totalSupply()).to.equal(initialSupply + amount);
    });

    it("test_overmint", async function () {
      await token.setMinter(accounts[0].address);
      const creationTime = await token.startEpochTime();
      const rate = await token.rate();

      await ethers.provider.send("evm_increaseTime", [week]);
      await ethers.provider.send("evm_mine", []);

      const currentTime = BigInt(await time.latest());
      const amount = (currentTime - creationTime + 2n) * rate;
      await expect(token.mint(accounts[1].address, amount)).to.be.revertedWith(
        "dev: exceeds allowable mint amount"
      );
    });

    it("test_minter_only", async function () {
      await token.setMinter(accounts[0].address);
      await expect(
        token.connect(accounts[1]).mint(accounts[1].address, 0)
      ).to.be.revertedWith("dev: minter only");
    });

    it("test_zero_address", async function () {
      await token.setMinter(accounts[0].address);
      await expect(token.mint(ZERO_ADDRESS, 0)).to.be.revertedWith(
        "dev: zero address"
      );
    });
  });
});
