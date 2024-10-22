import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deploySampleSaleTemplate, sendEther } from "../../../scenarioHelper";

describe("FeeDistributor", () => {
  const TEMPLATE_NAME = ethers.encodeBytes32String("SampleTemplate");

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
    await token.waitForDeployment();

    coinA = await Token.deploy("Coin A", "USDA", 18);
    await coinA.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    factory = await Factory.deploy();
    await factory.waitForDeployment();
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_recover_balance", () => {
    let accounts: SignerWithAddress[];
    beforeEach(async () => {
      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
        await time.latest()
      );
      await feeDistributor.waitForDeployment();
      accounts = await ethers.getSigners();
    });

    it("test_assumptions", async function () {
      expect(await feeDistributor.isKilled()).to.be.eq(0);
      expect(await feeDistributor.admin()).to.equal(alice.address);
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

      await sendEther(feeDistributor.address, "1", bob);
      await coinA.connect(dan)._mintForTesting(feeDistributor.address, 31337);
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);

      expect(await feeDistributor.admin()).to.equal(alice.address);

      const initialEthAlice = await ethers.provider.getBalance(alice.address);
      const tx = await feeDistributor
        .connect(alice)
        .recoverBalance(ethers.ZeroAddress);
      const receipt = await tx.wait();

      expect(await ethers.provider.getBalance(alice.address)).to.eq(
        initialEthAlice
          .add(ethers.parseEther("1"))
          .sub(receipt.effectiveGasPrice.mul(receipt.gasUsed))
      );

      await feeDistributor.connect(alice).recoverBalance(coinA.address);
      expect(await coinA.balanceOf(alice.address)).to.equal(31337);
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

      expect(await feeDistributor.admin()).to.equal(alice.address);

      expect(await coinA.balanceOf(alice.address)).to.equal(0);
      await feeDistributor.connect(alice).recoverBalance(coinA.address);
      expect(await coinA.balanceOf(alice.address)).to.equal(31337);
    });
  });
});
