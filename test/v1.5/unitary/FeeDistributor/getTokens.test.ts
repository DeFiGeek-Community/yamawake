import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { sendEther, deploySampleSaleTemplate } from "../../../scenarioHelper";

describe("FeeDistributor", () => {
  const DAY = 86400;
  const TEMPLATE_NAME = ethers.utils.formatBytes32String("SampleTemplate");

  let snapshot: SnapshotRestorer;
  let alice: SignerWithAddress, bob: SignerWithAddress;

  let feeDistributor: Contract;
  let votingEscrow: Contract;
  let factory: Contract;
  let auction: Contract;
  let token: Contract;
  let coinA: Contract;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob] = await ethers.getSigners();

    const FeeDistributor = await ethers.getContractFactory(
      "FeeDistributor",
      alice
    );
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

    feeDistributor = await FeeDistributor.deploy(
      votingEscrow.address,
      factory.address,
      await time.latest()
    );
    await feeDistributor.deployed();

    await coinA._mintForTesting(bob.address, ethers.utils.parseEther("10"));

    await coinA
      .connect(bob)
      .approve(factory.address, ethers.utils.parseEther("10"));
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_getTokens", () => {
    const amount = ethers.utils.parseEther("1000");
    it("should return the array of token addresses", async function () {
      let startTime = await time.latest();
      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime
      );
      await feeDistributor.deployed();

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        bob
      );

      await sendEther(feeDistributor.address, "10", alice);
      await coinA._mintForTesting(
        auction.address,
        ethers.utils.parseEther("10")
      );
      // Calling the mock function to add coinA to the reward list and transfer coinA from auction to feeDistributor
      await auction.withdrawRaisedToken(coinA.address);

      expect(await feeDistributor.getTokens()).to.deep.equal([
        ethers.constants.AddressZero,
        coinA.address,
      ]);
    });
  });
});