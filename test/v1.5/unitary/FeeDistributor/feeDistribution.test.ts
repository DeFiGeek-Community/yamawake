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
  const DAY = 86400;
  const WEEK = DAY * 7;
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
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    factory = await Factory.deploy();
    await factory.waitForDeployment();

    feeDistributor = await FeeDistributor.deploy(
      votingEscrow.address,
      factory.address,
      await time.latest()
    );
    await feeDistributor.waitForDeployment();
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_fee_distribution", () => {
    it(`test_eth_deposited_after`, async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));

      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 7; j++) {
          await sendEther(feeDistributor.address, "1", bob);
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
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
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
      await auction.withdrawRaisedToken(coinA.address);

      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 7; j++) {
          await coinA
            .connect(bob)
            .transfer(feeDistributor.address, ethers.parseEther("1"));
          await feeDistributor.checkpointToken(coinA.address);
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
        feeDistributor.connect(alice)["claim(address)"](coinA.address)
      ).to.changeTokenBalance(coinA, alice, 0);
    });

    it("test_eth_deposited_during", async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));

      await time.increase(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);

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

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 7; j++) {
          await sendEther(feeDistributor.address, "1", bob);
          await feeDistributor.checkpointToken(ethers.ZeroAddress);
          await feeDistributor.checkpointTotalSupply();
          await time.increase(DAY);
        }
      }

      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      const initBalanceAlice = await alice.getBalance();
      let tx = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt = await tx.wait();
      let gas = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      const balanceAlice = await alice.getBalance();
      const diff = balanceAlice
        .sub(ethers.parseEther("21"))
        .sub(initBalanceAlice)
        .add(gas)
        .abs();
      expect(diff).to.be.lessThan(10);
    });

    it("test_token_deposited_during", async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
      await coinA._mintForTesting(bob.address, ethers.parseEther("100"));

      await time.increase(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);

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

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 7; j++) {
          await coinA
            .connect(bob)
            .transfer(feeDistributor.address, ethers.parseEther("1"));
          await feeDistributor.checkpointToken(coinA.address);
          await feeDistributor.checkpointTotalSupply();
          await time.increase(DAY);
        }
      }

      await time.increase(WEEK);
      await feeDistributor.checkpointToken(coinA.address);
      await feeDistributor.connect(alice)["claim(address)"](coinA.address);

      const balanceAlice = await coinA.balanceOf(alice.address);
      const diff = Math.abs(
        balanceAlice.sub(ethers.parseEther("21")).toNumber()
      );
      expect(diff).to.be.lessThan(10);
    });

    it("test_eth_deposited_before", async function () {
      const [alice, bob] = await ethers.getSigners();
      const amount = ethers.parseEther("1000");

      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));

      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);
      const startTime = await time.latest();
      await time.increase(WEEK * 5);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime
      );
      await feeDistributor.waitForDeployment();

      await sendEther(feeDistributor.address, "10", bob);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      const initBalanceAlice = await alice.getBalance();
      let tx = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt = await tx.wait();
      let gas = receipt.effectiveGasPrice.mul(receipt.gasUsed);

      const balanceAlice = await alice.getBalance();
      const diff = balanceAlice
        .sub(ethers.parseEther("10"))
        .sub(initBalanceAlice)
        .add(gas)
        .abs();
      expect(diff).to.be.lessThan(10);
    });

    it("test_token_deposited_before", async function () {
      const [alice, bob] = await ethers.getSigners();
      const amount = ethers.parseEther("1000");

      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
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
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
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
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);

      await coinA
        .connect(bob)
        .transfer(feeDistributor.address, ethers.parseEther("10"));
      await feeDistributor.checkpointToken(coinA.address);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(coinA.address);
      await feeDistributor.connect(alice)["claim(address)"](coinA.address);

      const balanceAlice = await coinA.balanceOf(alice.address);
      const diff = balanceAlice.sub(ethers.parseEther("10")).abs();
      expect(diff).to.be.lessThan(10);
    });

    it("test_eth_deposited_twice", async function () {
      const amount = ethers.parseEther("1000");

      await token.approve(votingEscrow.address, amount.mul(10));

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
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime
      );
      await feeDistributor.waitForDeployment();

      await sendEther(feeDistributor.address, "10", bob);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);

      await time.increase(WEEK);

      await feeDistributor.checkpointToken(ethers.ZeroAddress);

      const initBalanceAlice = await alice.getBalance();
      let tx = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt = await tx.wait();
      let gas = receipt.effectiveGasPrice.mul(receipt.gasUsed);

      const tokensToExclude = await feeDistributor.tokensPerWeek(
        ethers.ZeroAddress,
        excludeTime
      );

      const balanceAlice = await alice.getBalance();
      expect(
        ethers.utils
          .parseEther("10")
          .sub(balanceAlice.sub(initBalanceAlice).add(gas))
          .sub(tokensToExclude)
      ).to.be.lt(10);
    });

    it("test_token_deposited_twice", async function () {
      const amount = ethers.parseEther("1000");

      await token.approve(votingEscrow.address, amount.mul(10));
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
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
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
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);

      await coinA
        .connect(bob)
        .transfer(feeDistributor.address, ethers.parseEther("10"));
      await feeDistributor.checkpointToken(coinA.address);

      await time.increase(WEEK);

      await feeDistributor.checkpointToken(coinA.address);

      await feeDistributor.connect(alice)["claim(address)"](coinA.address);

      const tokensToExclude = await feeDistributor.tokensPerWeek(
        coinA.address,
        excludeTime
      );

      expect(
        ethers.utils
          .parseEther("10")
          .sub(await coinA.balanceOf(alice.address))
          .sub(tokensToExclude)
      ).to.be.lt(10);
    });

    it("test_eth_deposited_parallel", async function () {
      const amount = ethers.parseEther("1000");
      const initBalanceAlice = await alice.getBalance();
      const initBalanceBob = await bob.getBalance();

      let txAliceApprove = await token
        .connect(alice)
        .approve(votingEscrow.address, amount.mul(10));
      let receiptAliceApprove = await txAliceApprove.wait();
      let gasAliceApprove = receiptAliceApprove.effectiveGasPrice.mul(
        receiptAliceApprove.gasUsed
      );
      let txBobApprove = await token
        .connect(bob)
        .approve(votingEscrow.address, amount.mul(10));
      let receiptBobApprove = await txBobApprove.wait();
      let gasBobApprove = receiptBobApprove.effectiveGasPrice.mul(
        receiptBobApprove.gasUsed
      );
      const txTransfer = await token
        .connect(alice)
        .transfer(bob.address, amount);
      let receiptTransfer = await txTransfer.wait();
      let gasTransfer = receiptTransfer.effectiveGasPrice.mul(
        receiptTransfer.gasUsed
      );
      const currentTimestamp = await time.latest();
      let txAliceLock = await votingEscrow
        .connect(alice)
        .createLock(amount, currentTimestamp + 8 * WEEK);
      let receiptAliceLock = await txAliceLock.wait();
      let gasAliceLock = receiptAliceLock.effectiveGasPrice.mul(
        receiptAliceLock.gasUsed
      );
      let txBobLock = await votingEscrow
        .connect(bob)
        .createLock(amount, currentTimestamp + 8 * WEEK);
      let receiptBobLock = await txBobLock.wait();
      let gasBobLock = receiptBobLock.effectiveGasPrice.mul(
        receiptBobLock.gasUsed
      );

      await time.increase(WEEK);

      const startTime = await time.latest();

      await time.increase(5 * WEEK);

      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributor",
        charlie
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime
      );
      await feeDistributor.waitForDeployment();

      await sendEther(feeDistributor.address, "10", charlie);
      await feeDistributor.connect(charlie).checkpointToken(ethers.ZeroAddress);

      await time.increase(WEEK);

      await feeDistributor.connect(charlie).checkpointToken(ethers.ZeroAddress);

      let txAlice = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receiptAlice = await txAlice.wait();
      let gasAlice = receiptAlice.effectiveGasPrice.mul(receiptAlice.gasUsed);
      let txBob = await feeDistributor
        .connect(bob)
        ["claim(address)"](ethers.ZeroAddress);
      let receiptBob = await txBob.wait();
      let gasBob = receiptBob.effectiveGasPrice.mul(receiptBob.gasUsed);

      const balanceAlice = await alice.getBalance();
      const balanceBob = await bob.getBalance();

      expect(
        balanceAlice
          .add(gasTransfer)
          .add(gasAliceApprove)
          .add(gasAliceLock)
          .add(gasAlice)
          .sub(initBalanceAlice)
      ).to.equal(
        balanceBob
          .add(gasBobApprove)
          .add(gasBobLock)
          .add(gasBob)
          .sub(initBalanceBob)
      );
      expect(
        balanceAlice
          .add(balanceBob)
          .add(gasTransfer)
          .add(gasAliceApprove)
          .add(gasAliceLock)
          .add(gasAlice)
          .add(gasBobApprove)
          .add(gasBobLock)
          .add(gasBob)
          .sub(initBalanceAlice)
          .sub(initBalanceBob)
      ).to.be.closeTo(ethers.parseEther("10"), 20);
    });

    it("test_token_deposited_parallel", async function () {
      const amount = ethers.parseEther("1000");

      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
      await token.connect(bob).approve(votingEscrow.address, amount.mul(10));
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
        "FeeDistributor",
        alice
      );
      feeDistributor = await FeeDistributor.deploy(
        votingEscrow.address,
        factory.address,
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
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);

      await coinA
        .connect(charlie)
        .transfer(feeDistributor.address, ethers.parseEther("10"));
      await feeDistributor.checkpointToken(coinA.address);

      await time.increase(WEEK);

      await feeDistributor.checkpointToken(coinA.address);

      await feeDistributor.connect(alice)["claim(address)"](coinA.address);
      await feeDistributor.connect(bob)["claim(address)"](coinA.address);

      const balanceAlice = await coinA.balanceOf(alice.address);
      const balanceBob = await coinA.balanceOf(bob.address);

      expect(balanceAlice).to.equal(balanceBob);
      expect(balanceAlice.add(balanceBob)).to.be.closeTo(
        ethers.parseEther("10"),
        20
      );
    });
  });
});
