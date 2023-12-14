import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { deploySampleSaleTemplate, sendEther } from "../../../scenarioHelper";

describe("FeeDistributor", () => {
  const TEMPLATE_NAME = ethers.utils.formatBytes32String("SampleTemplate");

  let alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    dan: SignerWithAddress;

  let feeDistributor: Contract;
  let votingEscrow: Contract;
  let factory: Contract;
  let auction: Contract;
  let token: Contract;
  let coinA: Contract;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob, charlie, dan] = await ethers.getSigners();

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
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_recover_balance", () => {
    let accounts: SignerWithAddress[];
    beforeEach(async () => {
      const Distributor = await ethers.getContractFactory("FeeDistributor");
      feeDistributor = await Distributor.deploy(
        votingEscrow.address,
        factory.address,
        await time.latest(),
        alice.address,
        bob.address
      );
      await feeDistributor.deployed();
      accounts = await ethers.getSigners();
    });

    it("test_assumptions", async function () {
      expect(await feeDistributor.isKilled()).to.be.eq(0);
      expect(await feeDistributor.emergencyReturn()).to.equal(bob.address);
    });

    it("test_recover_balance", async function () {
      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      const initialEthBob = await ethers.provider.getBalance(bob.address);
      await sendEther(feeDistributor.address, "1", alice);
      await coinA._mintForTesting(feeDistributor.address, 31337);
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);

      expect(await feeDistributor.emergencyReturn()).to.equal(bob.address);

      await feeDistributor
        .connect(alice)
        .recoverBalance(ethers.constants.AddressZero);
      expect(await ethers.provider.getBalance(bob.address)).to.eq(
        initialEthBob.add(ethers.utils.parseEther("1"))
      );

      await feeDistributor.connect(alice).recoverBalance(coinA.address);
      expect(await coinA.balanceOf(bob.address)).to.equal(31337);
    });

    it("test_recover_balance_after_kill", async function () {
      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      await coinA._mintForTesting(feeDistributor.address, 31337);
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);

      await feeDistributor.connect(alice).killMe();

      expect(await feeDistributor.emergencyReturn()).to.equal(bob.address);

      expect(await coinA.balanceOf(bob.address)).to.equal(0);
      await feeDistributor.connect(alice).recoverBalance(coinA.address);
      expect(await coinA.balanceOf(bob.address)).to.equal(31337);
    });
  });
});
