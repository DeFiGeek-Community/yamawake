import { ethers } from "hardhat";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { YMWK } from "../../../../typechain-types";

describe("YMWK", function () {
  let accounts: SignerWithAddress[];
  let token: YMWK;
  let snapshot: SnapshotRestorer;

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
    it("test_burn", async function () {
      const balance = await token.balanceOf(accounts[0].address);
      const initialSupply = await token.totalSupply();

      await token.connect(accounts[0]).burn(31337);

      expect(await token.balanceOf(accounts[0].address)).to.equal(
        balance - 31337n
      );
      expect(await token.totalSupply()).to.equal(initialSupply - 31337n);
    });

    it("test_burn_not_admin", async function () {
      const initialSupply = await token.totalSupply();

      await token.transfer(accounts[1].address, 1000000);
      await token.connect(accounts[1]).burn(31337);

      expect(await token.balanceOf(accounts[1].address)).to.equal(
        1000000 - 31337
      );
      expect(await token.totalSupply()).to.equal(initialSupply - 31337n);
    });

    it("test_burn_all", async function () {
      const initialSupply = await token.totalSupply();

      await token.connect(accounts[0]).burn(initialSupply);

      expect(await token.balanceOf(accounts[0].address)).to.equal(0);
      expect(await token.totalSupply()).to.equal(0);
    });

    it("test_overburn", async function () {
      const initialSupply = await token.totalSupply();

      await expect(
        token.connect(accounts[0]).burn(initialSupply + 1n)
      ).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
  });
});
