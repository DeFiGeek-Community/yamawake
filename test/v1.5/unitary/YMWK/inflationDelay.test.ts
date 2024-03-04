import { ethers } from "hardhat";
import { expect } from "chai";
import {
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import Constants from "../../Constants";

describe("YMWK", function () {
  let accounts: SignerWithAddress[];
  let token: Contract;
  let snapshot: SnapshotRestorer;

  const YEAR = Constants.YEAR;

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

  it("test_rate", async function () {
    expect(await token.rate()).to.equal(0);

    await ethers.provider.send("evm_increaseTime", [YEAR.add(1).toNumber()]);
    await ethers.provider.send("evm_mine", []);

    await token.updateMiningParameters();

    expect(await token.rate()).to.be.gt(0);
  });

  it("test_startEpochTime", async function () {
    const creationTime = await token.startEpochTime();

    await ethers.provider.send("evm_increaseTime", [YEAR.add(1).toNumber()]);
    await ethers.provider.send("evm_mine", []);

    await token.updateMiningParameters();

    expect(await token.startEpochTime()).to.equal(creationTime.add(YEAR));
  });

  it("test_miningEpoch", async function () {
    expect(await token.miningEpoch()).to.equal(-1);

    await ethers.provider.send("evm_increaseTime", [YEAR.add(1).toNumber()]);
    await ethers.provider.send("evm_mine", []);

    await token.updateMiningParameters();

    expect(await token.miningEpoch()).to.equal(0);
  });

  it("test_availableSupply", async function () {
    expect(await token.availableSupply()).to.equal(
      ethers.utils.parseEther("450000000")
    );

    await ethers.provider.send("evm_increaseTime", [YEAR.add(1).toNumber()]);
    await ethers.provider.send("evm_mine", []);

    await token.updateMiningParameters();

    expect(await token.availableSupply()).to.be.gt(
      ethers.utils.parseEther("450000000")
    );
  });
});
