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
    const Token = await ethers.getContractFactory("YMWK");
    token = await Token.deploy();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("YMWK Setters", function () {
    it("should revert when non-admin tries to set minter", async function () {
      await expect(
        token.connect(accounts[1]).setMinter(accounts[2].address)
      ).to.be.revertedWith("dev: admin only");
    });

    it("should revert when non-admin tries to set admin", async function () {
      await expect(
        token.connect(accounts[1]).setAdmin(accounts[2].address)
      ).to.be.revertedWith("dev: admin only");
    });

    it("should allow admin to set minter", async function () {
      await token.connect(accounts[0]).setMinter(accounts[1].address);
      expect(await token.minter()).to.equal(accounts[1].address);
    });

    it("should allow admin to set admin", async function () {
      await token.connect(accounts[0]).setAdmin(accounts[1].address);
      expect(await token.admin()).to.equal(accounts[1].address);
    });
  });
});
