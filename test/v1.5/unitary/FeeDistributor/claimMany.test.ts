import { expect } from "chai";
import { ethers } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deploySampleSaleTemplate, sendEther } from "../../../scenarioHelper";
import {
  Factory,
  FeeDistributor,
  MockToken,
  SampleTemplate,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

describe("FeeDistributor", () => {
  const DAY = 86400;
  const WEEK = DAY * 7;
  const TEMPLATE_NAME = ethers.encodeBytes32String("SampleTemplate");

  let snapshot: SnapshotRestorer;
  let alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    dan: SignerWithAddress;

  let feeDistributor: FeeDistributor;
  let votingEscrow: VotingEscrow;
  let factory: Factory;
  let auction: SampleTemplate;
  let token: YMWK;
  let coinA: MockToken;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob, charlie, dan] = await ethers.getSigners();

    const FeeDistributor = await ethers.getContractFactory(
      "FeeDistributor",
      alice
    );
    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const Factory = await ethers.getContractFactory("Factory");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    coinA = await Token.deploy("Coin A", "USDA", 18);
    await coinA.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    factory = await Factory.deploy();
    await factory.waitForDeployment();

    feeDistributor = await FeeDistributor.deploy(
      votingEscrow.target,
      factory.target,
      await time.latest()
    );
    await feeDistributor.waitForDeployment();

    await coinA._mintForTesting(dan.address, ethers.parseEther("10"));

    await coinA.connect(dan).approve(factory.target, ethers.parseEther("10"));
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_claim_many", () => {
    const amount = ethers.parseEther("1000");
    it("test_claim_many_eth", async function () {
      for (let acct of [alice, bob, charlie]) {
        await token.connect(acct).approve(votingEscrow.target, amount * 10n);
        await token.connect(alice).transfer(acct.address, amount);
        await votingEscrow
          .connect(acct)
          .createLock(amount, (await time.latest()) + 8 * WEEK);
      }
      await time.increase(WEEK);
      let startTime = await time.latest();
      await time.increase(WEEK * 5);
      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.target,
        factory.target,
        startTime
      );
      await feeDistributor.waitForDeployment();

      await sendEther(feeDistributor.target, "10", alice);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);

      const snapshot = await takeSnapshot();

      let tx = await feeDistributor
        .connect(alice)
        .claimMany(
          [alice.address, bob.address, charlie.address].concat(
            Array(17).fill(ethers.ZeroAddress)
          ),
          ethers.ZeroAddress
        );
      let receipt = await tx.wait();
      let gas = receipt!.gasPrice * receipt!.gasUsed;
      let balances = [
        (await ethers.provider.getBalance(alice)) + gas,
        await ethers.provider.getBalance(bob),
        await ethers.provider.getBalance(charlie),
      ];

      await snapshot.restore();

      let tx1 = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt1 = await tx1.wait();
      let gas1 = receipt1!.gasPrice * receipt1!.gasUsed;
      let tx2 = await feeDistributor
        .connect(bob)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt2 = await tx2.wait();
      let gas2 = receipt2!.gasPrice * receipt2!.gasUsed;
      let tx3 = await feeDistributor
        .connect(charlie)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt3 = await tx3.wait();
      let gas3 = receipt3!.gasPrice * receipt3!.gasUsed;
      expect(balances).to.deep.equal([
        (await ethers.provider.getBalance(alice)) + gas1,
        (await ethers.provider.getBalance(bob)) + gas2,
        (await ethers.provider.getBalance(charlie)) + gas3,
      ]);
    });
    it("test_claim_many_token", async function () {
      for (let acct of [alice, bob, charlie]) {
        await token.connect(acct).approve(votingEscrow.target, amount * 10n);
        await token.connect(alice).transfer(acct.address, amount);
        await votingEscrow
          .connect(acct)
          .createLock(amount, (await time.latest()) + 8 * WEEK);
      }
      await time.increase(WEEK);
      let startTime = await time.latest();
      await time.increase(WEEK * 5);
      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.target,
        factory.target,
        startTime
      );
      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );

      await expect(
        feeDistributor.checkpointToken(coinA.target)
      ).to.be.revertedWith("Token not registered");
      await expect(
        feeDistributor.connect(dan).addRewardToken(coinA.target)
      ).to.be.revertedWith("Unauthorized");

      await coinA._mintForTesting(auction.target, ethers.parseEther("10"));

      // Add coinA to the reward list by the admin
      await expect(feeDistributor.connect(alice).addRewardToken(coinA.target))
        .to.not.be.reverted;

      await feeDistributor.checkpointToken(coinA.target);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(coinA.target);

      const snapshot = await takeSnapshot();

      await feeDistributor
        .connect(alice)
        .claimMany(
          [alice.address, bob.address, charlie.address].concat(
            Array(17).fill(ethers.ZeroAddress)
          ),
          coinA.target
        );
      let balances = [
        await coinA.balanceOf(alice.address),
        await coinA.balanceOf(bob.address),
        await coinA.balanceOf(charlie.address),
      ];

      await snapshot.restore();

      await feeDistributor.connect(alice)["claim(address)"](coinA.target);
      await feeDistributor.connect(bob)["claim(address)"](coinA.target);
      await feeDistributor.connect(charlie)["claim(address)"](coinA.target);
      expect(balances).to.deep.equal([
        await coinA.balanceOf(alice.address),
        await coinA.balanceOf(bob.address),
        await coinA.balanceOf(charlie.address),
      ]);
    });
    it("test_claim_many_eth_same_account", async function () {
      for (let acct of [alice, bob, charlie]) {
        await token.connect(acct).approve(votingEscrow.target, amount * 10n);
        await token.connect(alice).transfer(acct.address, amount);
        await votingEscrow
          .connect(acct)
          .createLock(amount, (await time.latest()) + 8 * WEEK);
      }
      await time.increase(WEEK);
      let startTime = await time.latest();
      await time.increase(WEEK * 5);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.target,
        factory.target,
        startTime
      );
      await feeDistributor.waitForDeployment();

      await sendEther(feeDistributor.target, "10", alice);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);

      const expected = await feeDistributor
        .connect(alice)
        ["claim(address)"].staticCall(ethers.ZeroAddress);

      expect(expected).to.above(0);
      await expect(
        feeDistributor
          .connect(alice)
          .claimMany(Array(20).fill(alice.address), ethers.ZeroAddress)
      ).to.changeEtherBalance(alice, expected);
    });
    it("test_claim_many_token_same_account", async function () {
      for (let acct of [alice, bob, charlie]) {
        await token.connect(acct).approve(votingEscrow.target, amount * 10n);
        await token.connect(alice).transfer(acct.address, amount);
        await votingEscrow
          .connect(acct)
          .createLock(amount, (await time.latest()) + 8 * WEEK);
      }
      await time.increase(WEEK);
      let startTime = await time.latest();
      await time.increase(WEEK * 5);
      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.target,
        factory.target,
        startTime
      );
      await feeDistributor.waitForDeployment();
      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );

      await coinA._mintForTesting(auction.target, ethers.parseEther("10"));
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.target);

      await feeDistributor.checkpointToken(coinA.target);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(coinA.target);

      const expected = await feeDistributor
        .connect(alice)
        ["claim(address)"].staticCall(coinA.target);

      expect(expected).to.above(0);
      await expect(
        feeDistributor
          .connect(alice)
          .claimMany(Array(20).fill(alice.address), coinA.target)
      ).to.changeTokenBalance(coinA, alice, expected);
    });
  });
});
