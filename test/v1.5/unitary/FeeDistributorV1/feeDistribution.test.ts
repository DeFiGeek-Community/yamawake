import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deploySampleSaleTemplate, sendEther } from "../../../scenarioHelper";
import {
  Factory,
  FeeDistributorV1,
  MockToken,
  SampleTemplate,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";
import { abs } from "../../../helper";

describe("FeeDistributorV1", () => {
  const DAY = 86400;
  const WEEK = DAY * 7;
  const TEMPLATE_NAME = ethers.encodeBytes32String("SampleTemplate");

  let alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    dan: SignerWithAddress;
  let feeDistributor: FeeDistributorV1;
  let votingEscrow: VotingEscrow;
  let factory: Factory;
  let auction: SampleTemplate;
  let token: YMWK;
  let coinA: MockToken;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob, charlie, dan] = await ethers.getSigners();

    const FeeDistributor = await ethers.getContractFactory(
      "FeeDistributorV1",
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

    feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
      votingEscrow.target,
      factory.target,
      await time.latest(),
    ])) as unknown as FeeDistributorV1;
    await feeDistributor.waitForDeployment();
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_fee_distribution", () => {
    it(`test_eth_deposited_after`, async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.target, amount * 10n);

      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 7; j++) {
          await sendEther(feeDistributor.target, "1", bob);
          await feeDistributor.checkpointToken(ethers.ZeroAddress);
          await feeDistributor.checkpointTotalSupply();
          await time.increase(DAY);
        }
      }

      await time.increase(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 3 * WEEK);
      await time.increase(2 * WEEK);

      await expect(
        feeDistributor.connect(alice)["claim(address)"](ethers.ZeroAddress)
      ).to.changeEtherBalance(alice, 0);
    });
    it(`test_token_deposited_after`, async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.target, amount * 10n);
      await coinA._mintForTesting(bob.address, ethers.parseEther("100"));

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.target);

      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 7; j++) {
          await coinA
            .connect(bob)
            .transfer(feeDistributor.target, ethers.parseEther("1"));
          await feeDistributor.checkpointToken(coinA.target);
          await feeDistributor.checkpointTotalSupply();
          await time.increase(DAY);
        }
      }

      await time.increase(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 3 * WEEK);
      await time.increase(2 * WEEK);

      await expect(
        feeDistributor.connect(alice)["claim(address)"](coinA.target)
      ).to.changeTokenBalance(coinA, alice, 0);
    });

    it("test_eth_deposited_during", async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.target, amount * 10n);

      await time.increase(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        alice
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        await time.latest(),
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 7; j++) {
          await sendEther(feeDistributor.target, "1", bob);
          await feeDistributor.checkpointToken(ethers.ZeroAddress);
          await feeDistributor.checkpointTotalSupply();
          await time.increase(DAY);
        }
      }

      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      const initBalanceAlice = await ethers.provider.getBalance(alice);
      let tx = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt = await tx.wait();
      let gas = receipt!.gasPrice * receipt!.gasUsed;
      const balanceAlice = await ethers.provider.getBalance(alice);
      const diff = abs(
        balanceAlice - ethers.parseEther("21") - initBalanceAlice + gas
      );
      expect(diff).to.be.lessThan(10);
    });

    it("test_token_deposited_during", async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.target, amount * 10n);
      await coinA._mintForTesting(bob.address, ethers.parseEther("100"));

      await time.increase(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        alice
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        await time.latest(),
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.target);

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 7; j++) {
          await coinA
            .connect(bob)
            .transfer(feeDistributor.target, ethers.parseEther("1"));
          await feeDistributor.checkpointToken(coinA.target);
          await feeDistributor.checkpointTotalSupply();
          await time.increase(DAY);
        }
      }

      await time.increase(WEEK);
      await feeDistributor.checkpointToken(coinA.target);
      await feeDistributor.connect(alice)["claim(address)"](coinA.target);

      const balanceAlice = await coinA.balanceOf(alice.address);
      const diff = abs(balanceAlice - ethers.parseEther("21"));
      expect(diff).to.be.lessThan(10);
    });

    it("test_eth_deposited_before", async function () {
      const [alice, bob] = await ethers.getSigners();
      const amount = ethers.parseEther("1000");

      await token.connect(alice).approve(votingEscrow.target, amount * 10n);

      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);
      const startTime = await time.latest();
      await time.increase(WEEK * 5);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        alice
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        startTime,
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      await sendEther(feeDistributor.target, "10", bob);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      const initBalanceAlice = await ethers.provider.getBalance(alice);
      let tx = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt = await tx.wait();
      let gas = receipt!.gasPrice * receipt!.gasUsed;

      const balanceAlice = await ethers.provider.getBalance(alice);
      const diff = abs(
        balanceAlice - ethers.parseEther("10") - initBalanceAlice + gas
      );
      expect(diff).to.be.lessThan(10);
    });

    it("test_token_deposited_before", async function () {
      const [alice, bob] = await ethers.getSigners();
      const amount = ethers.parseEther("1000");

      await token.connect(alice).approve(votingEscrow.target, amount * 10n);
      await coinA
        .connect(bob)
        ._mintForTesting(bob.address, ethers.parseEther("100"));

      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);
      const startTime = await time.latest();
      await time.increase(WEEK * 5);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        alice
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        startTime,
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.target);

      await coinA
        .connect(bob)
        .transfer(feeDistributor.target, ethers.parseEther("10"));
      await feeDistributor.checkpointToken(coinA.target);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(coinA.target);
      await feeDistributor.connect(alice)["claim(address)"](coinA.target);

      const balanceAlice = await coinA.balanceOf(alice.address);
      const diff = balanceAlice - abs(ethers.parseEther("10"));
      expect(diff).to.be.lessThan(10);
    });

    it("test_eth_deposited_twice", async function () {
      const amount = ethers.parseEther("1000");

      await token.approve(votingEscrow.target, amount * 10n);

      const currentTimestamp = await time.latest();
      await votingEscrow.createLock(amount, currentTimestamp + 4 * WEEK);

      await time.increase(WEEK);

      const startTime = await time.latest();

      await time.increase(3 * WEEK);

      await votingEscrow.connect(alice).withdraw();
      const excludeTime = Math.floor((await time.latest()) / WEEK) * WEEK;
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 4 * WEEK);

      await time.increase(2 * WEEK);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        alice
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        startTime,
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      await sendEther(feeDistributor.target, "10", bob);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);

      await time.increase(WEEK);

      await feeDistributor.checkpointToken(ethers.ZeroAddress);

      const initBalanceAlice = await ethers.provider.getBalance(alice);
      let tx = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt = await tx.wait();
      let gas = receipt!.gasPrice * receipt!.gasUsed;

      const tokensToExclude = await feeDistributor.tokensPerWeek(
        ethers.ZeroAddress,
        excludeTime
      );

      const balanceAlice = await ethers.provider.getBalance(alice);
      expect(
        ethers.parseEther("10") -
          (balanceAlice - initBalanceAlice + gas) -
          tokensToExclude
      ).to.be.lt(10);
    });

    it("test_token_deposited_twice", async function () {
      const amount = ethers.parseEther("1000");

      await token.approve(votingEscrow.target, amount * 10n);
      await coinA._mintForTesting(bob.address, ethers.parseEther("100"));

      const currentTimestamp = await time.latest();
      await votingEscrow.createLock(amount, currentTimestamp + 4 * WEEK);

      await time.increase(WEEK);

      const startTime = await time.latest();

      await time.increase(3 * WEEK);

      await votingEscrow.connect(alice).withdraw();
      const excludeTime = Math.floor((await time.latest()) / WEEK) * WEEK;
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 4 * WEEK);

      await time.increase(2 * WEEK);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        alice
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        startTime,
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.target);

      await coinA
        .connect(bob)
        .transfer(feeDistributor.target, ethers.parseEther("10"));
      await feeDistributor.checkpointToken(coinA.target);

      await time.increase(WEEK);

      await feeDistributor.checkpointToken(coinA.target);

      await feeDistributor.connect(alice)["claim(address)"](coinA.target);

      const tokensToExclude = await feeDistributor.tokensPerWeek(
        coinA.target,
        excludeTime
      );

      expect(
        ethers.parseEther("10") -
          (await coinA.balanceOf(alice.address)) -
          tokensToExclude
      ).to.be.lt(10);
    });

    it("test_eth_deposited_parallel", async function () {
      const amount = ethers.parseEther("1000");
      const initBalanceAlice = await ethers.provider.getBalance(alice);
      const initBalanceBob = await ethers.provider.getBalance(bob);

      let txAliceApprove = await token
        .connect(alice)
        .approve(votingEscrow.target, amount * 10n);
      let receiptAliceApprove = await txAliceApprove.wait();
      let gasAliceApprove =
        receiptAliceApprove!.gasPrice * receiptAliceApprove!.gasUsed;
      let txBobApprove = await token
        .connect(bob)
        .approve(votingEscrow.target, amount * 10n);
      let receiptBobApprove = await txBobApprove.wait();
      let gasBobApprove =
        receiptBobApprove!.gasPrice * receiptBobApprove!.gasUsed;
      const txTransfer = await token
        .connect(alice)
        .transfer(bob.address, amount);
      let receiptTransfer = await txTransfer.wait();
      let gasTransfer = receiptTransfer!.gasPrice * receiptTransfer!.gasUsed;
      const currentTimestamp = await time.latest();
      let txAliceLock = await votingEscrow
        .connect(alice)
        .createLock(amount, currentTimestamp + 8 * WEEK);
      let receiptAliceLock = await txAliceLock.wait();
      let gasAliceLock = receiptAliceLock!.gasPrice * receiptAliceLock!.gasUsed;
      let txBobLock = await votingEscrow
        .connect(bob)
        .createLock(amount, currentTimestamp + 8 * WEEK);
      let receiptBobLock = await txBobLock.wait();
      let gasBobLock = receiptBobLock!.gasPrice * receiptBobLock!.gasUsed;

      await time.increase(WEEK);

      const startTime = await time.latest();

      await time.increase(5 * WEEK);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        charlie
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        startTime,
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      await sendEther(feeDistributor.target, "10", charlie);
      await feeDistributor.connect(charlie).checkpointToken(ethers.ZeroAddress);

      await time.increase(WEEK);

      await feeDistributor.connect(charlie).checkpointToken(ethers.ZeroAddress);

      let txAlice = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receiptAlice = await txAlice.wait();
      let gasAlice = receiptAlice!.gasPrice * receiptAlice!.gasUsed;
      let txBob = await feeDistributor
        .connect(bob)
        ["claim(address)"](ethers.ZeroAddress);
      let receiptBob = await txBob.wait();
      let gasBob = receiptBob!.gasPrice * receiptBob!.gasUsed;

      const balanceAlice = await ethers.provider.getBalance(alice);
      const balanceBob = await ethers.provider.getBalance(bob);

      expect(
        balanceAlice +
          gasTransfer +
          gasAliceApprove +
          gasAliceLock +
          gasAlice -
          initBalanceAlice
      ).to.equal(
        balanceBob + gasBobApprove + gasBobLock + gasBob - initBalanceBob
      );
      expect(
        balanceAlice +
          balanceBob +
          gasTransfer +
          gasAliceApprove +
          gasAliceLock +
          gasAlice +
          gasBobApprove +
          gasBobLock +
          gasBob -
          initBalanceAlice -
          initBalanceBob
      ).to.be.closeTo(ethers.parseEther("10"), 20);
    });

    it("test_token_deposited_parallel", async function () {
      const amount = ethers.parseEther("1000");

      await token.connect(alice).approve(votingEscrow.target, amount * 10n);
      await token.connect(bob).approve(votingEscrow.target, amount * 10n);
      await token.connect(alice).transfer(bob.address, amount);
      await coinA._mintForTesting(charlie.address, ethers.parseEther("100"));

      const currentTimestamp = await time.latest();
      await votingEscrow
        .connect(alice)
        .createLock(amount, currentTimestamp + 8 * WEEK);
      await votingEscrow
        .connect(bob)
        .createLock(amount, currentTimestamp + 8 * WEEK);

      await time.increase(WEEK);

      const startTime = await time.latest();

      await time.increase(5 * WEEK);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        alice
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        startTime,
      ])) as unknown as FeeDistributorV1;
      await feeDistributor.waitForDeployment();

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.target);

      await coinA
        .connect(charlie)
        .transfer(feeDistributor.target, ethers.parseEther("10"));
      await feeDistributor.checkpointToken(coinA.target);

      await time.increase(WEEK);

      await feeDistributor.checkpointToken(coinA.target);

      await feeDistributor.connect(alice)["claim(address)"](coinA.target);
      await feeDistributor.connect(bob)["claim(address)"](coinA.target);

      const balanceAlice = await coinA.balanceOf(alice.address);
      const balanceBob = await coinA.balanceOf(bob.address);

      expect(balanceAlice).to.equal(balanceBob);
      expect(balanceAlice + balanceBob).to.be.closeTo(
        ethers.parseEther("10"),
        20
      );
    });
  });
});
