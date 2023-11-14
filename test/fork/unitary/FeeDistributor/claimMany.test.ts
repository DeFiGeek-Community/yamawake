import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { sendEther, timeTravel } from "../../../scenarioHelper";

const DAY = 86400;
const WEEK = DAY * 7;
const TEMPLATE_NAME = ethers.utils.formatBytes32String("SampleTemplate");

describe("FeeDistributor", () => {
  let snapshot: SnapshotRestorer;
  let alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    dan: SignerWithAddress;

  let feeDistributor: Contract;
  let votingEscrow: Contract;
  let factory: Contract;
  let template: Contract;
  let auction: Contract;
  let token: Contract;
  let coinA: Contract;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob, charlie, dan] = await ethers.getSigners();

    const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
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
      await time.latest(),
      alice.address,
      alice.address
    );
    await feeDistributor.deployed();

    await coinA._mintForTesting(dan.address, ethers.utils.parseEther("10"));

    await coinA
      .connect(dan)
      .approve(factory.address, ethers.utils.parseEther("10"));
  });

  async function deploySaleTemplate(
    factory: Contract,
    feeDistributor: Contract
  ): Promise<Contract> {
    const Distributor = await ethers.getContractFactory("Distributor");
    const Template = await ethers.getContractFactory("SampleTemplate");
    const FeePool = await ethers.getContractFactory("FeePool");

    const feePool = await FeePool.deploy();
    await feePool.deployed();

    const distributor = await Distributor.deploy(
      factory.address,
      token.address
    );
    await distributor.deployed();

    const template = await Template.deploy(
      factory.address,
      feePool.address,
      distributor.address,
      feeDistributor.address
    );
    await template.deployed();

    await factory.addTemplate(
      TEMPLATE_NAME,
      template.address,
      Template.interface.getSighash("initialize"),
      Template.interface.getSighash("initializeTransfer")
    );

    const abiCoder = ethers.utils.defaultAbiCoder;
    const args = abiCoder.encode(
      ["address", "uint256"],
      [coinA.address, ethers.utils.parseEther("1")]
    );
    const tx = await factory.connect(dan).deployAuction(TEMPLATE_NAME, args);
    const receipt = await tx.wait();
    const event = receipt.events.find(
      (event: any) => event.event === "Deployed"
    );
    const [, templateAddr] = event.args;
    return Template.attach(templateAddr);
  }

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_claim_many", () => {
    const amount = ethers.utils.parseEther("1000");
    it("test_claim_many_eth", async function () {
      for (let acct of [alice, bob, charlie]) {
        await token.connect(acct).approve(votingEscrow.address, amount.mul(10));
        await token.connect(alice).transfer(acct.address, amount);
        await votingEscrow
          .connect(acct)
          .createLock(amount, (await time.latest()) + 8 * WEEK);
      }
      await time.increase(WEEK);
      let startTime = await time.latest();
      await time.increase(WEEK * 5);
      const Distributor = await ethers.getContractFactory("FeeDistributor");
      feeDistributor = await Distributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime,
        alice.address,
        alice.address
      );
      await sendEther(feeDistributor.address, "10", alice);
      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.constants.AddressZero);

      const snapshot = await takeSnapshot();

      let tx = await feeDistributor
        .connect(alice)
        .claimMany(
          [alice.address, bob.address, charlie.address].concat(
            Array(17).fill(ethers.constants.AddressZero)
          ),
          ethers.constants.AddressZero
        );
      let receipt = await tx.wait();
      let gas = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      let balances = [
        (await alice.getBalance()).add(gas),
        await bob.getBalance(),
        await charlie.getBalance(),
      ];

      await snapshot.restore();

      let tx1 = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.constants.AddressZero);
      let receipt1 = await tx1.wait();
      let gas1 = receipt1.effectiveGasPrice.mul(receipt1.gasUsed);
      let tx2 = await feeDistributor
        .connect(bob)
        ["claim(address)"](ethers.constants.AddressZero);
      let receipt2 = await tx2.wait();
      let gas2 = receipt2.effectiveGasPrice.mul(receipt2.gasUsed);
      let tx3 = await feeDistributor
        .connect(charlie)
        ["claim(address)"](ethers.constants.AddressZero);
      let receipt3 = await tx3.wait();
      let gas3 = receipt3.effectiveGasPrice.mul(receipt3.gasUsed);
      expect(balances).to.deep.equal([
        (await alice.getBalance()).add(gas1),
        (await bob.getBalance()).add(gas2),
        (await charlie.getBalance()).add(gas3),
      ]);
    });
    it("test_claim_many_token", async function () {
      for (let acct of [alice, bob, charlie]) {
        await token.connect(acct).approve(votingEscrow.address, amount.mul(10));
        await token.connect(alice).transfer(acct.address, amount);
        await votingEscrow
          .connect(acct)
          .createLock(amount, (await time.latest()) + 8 * WEEK);
      }
      await time.increase(WEEK);
      let startTime = await time.latest();
      await time.increase(WEEK * 5);
      const Distributor = await ethers.getContractFactory("FeeDistributor");
      feeDistributor = await Distributor.deploy(
        votingEscrow.address,
        factory.address,
        startTime,
        alice.address,
        alice.address
      );
      auction = await deploySaleTemplate(factory, feeDistributor);

      expect(feeDistributor.checkpointToken(coinA.address)).to.be.revertedWith(
        "Token not registered"
      );
      expect(feeDistributor.addRewardToken(coinA.address)).to.be.revertedWith(
        "You are not the auction."
      );

      await auction.withdrawRaisedToken(coinA.address);

      await feeDistributor.checkpointToken(coinA.address);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(coinA.address);

      const snapshot = await takeSnapshot();

      await feeDistributor
        .connect(alice)
        .claimMany(
          [alice.address, bob.address, charlie.address].concat(
            Array(17).fill(ethers.constants.AddressZero)
          ),
          coinA.address
        );
      let balances = [
        await coinA.balanceOf(alice.address),
        await coinA.balanceOf(bob.address),
        await coinA.balanceOf(charlie.address),
      ];

      await snapshot.restore();

      await feeDistributor.connect(alice)["claim(address)"](coinA.address);
      await feeDistributor.connect(bob)["claim(address)"](coinA.address);
      await feeDistributor.connect(charlie)["claim(address)"](coinA.address);
      expect(balances).to.deep.equal([
        await coinA.balanceOf(alice.address),
        await coinA.balanceOf(bob.address),
        await coinA.balanceOf(charlie.address),
      ]);
    });
    // it("test_claim_many_token_same_account", async function () {
    //   for (let acct of [alice, bob, charlie]) {
    //     await token.connect(acct).approve(votingEscrow.address, amount.mul(10));
    //     await token.connect(alice).transfer(acct.address, amount);
    //     await votingEscrow
    //       .connect(acct)
    //       .createLock(amount, (await time.latest()) + 8 * WEEK);
    //   }
    //   await time.increase(WEEK);
    //   let startTime = await time.latest();
    //   await time.increase(WEEK * 5);

    //   const Distributor = await ethers.getContractFactory("FeeDistributor");
    //   feeDistributor = await Distributor.deploy(
    //     factory.address,
    //     votingEscrow.address,
    //     startTime,
    //     alice.address,
    //     alice.address
    //   );
    //   await feeDistributor.deployed();

    //   await coinA._mintForTesting(
    //     feeDistributor.address,
    //     ethers.utils.parseEther("10")
    //   );
    //   await feeDistributor.checkpointToken();
    //   await time.increase(WEEK);
    //   await feeDistributor.checkpointToken();

    //   const expected = await feeDistributor.connect(alice).callStatic["claim()"]();

    //   expect(expected).to.above(0);
    //   expect(
    //     await feeDistributor
    //       .connect(alice)
    //       .claimMany(Array(20).fill(alice.address))
    //       .toString()
    //   ).to.changeTokenBalance(coinA, alice, expected);
    // });
    // it("test_claim_many_eth_same_account", async function () {
    //   for (let acct of [alice, bob, charlie]) {
    //     await token.connect(acct).approve(votingEscrow.address, amount.mul(10));
    //     await token.connect(alice).transfer(acct.address, amount);
    //     await votingEscrow
    //       .connect(acct)
    //       .createLock(amount, (await time.latest()) + 8 * WEEK);
    //   }
    //   await time.increase(WEEK);
    //   let startTime = await time.latest();
    //   await time.increase(WEEK * 5);

    //   const Distributor = await ethers.getContractFactory("FeeDistributor");
    //   distributor = await Distributor.deploy(
    //     factory.address,
    //     votingEscrow.address,
    //     startTime,
    //     alice.address,
    //     alice.address
    //   );
    //   await distributor.deployed();

    //   await coinA._mintForTesting(
    //     distributor.address,
    //     ethers.utils.parseEther("10")
    //   );
    //   await distributor.checkpointToken();
    //   await time.increase(WEEK);
    //   await distributor.checkpointToken();

    //   const expected = await distributor.connect(alice).callStatic["claim()"]();

    //   expect(expected).to.above(0);
    //   expect(
    //     await distributor
    //       .connect(alice)
    //       .claimMany(Array(20).fill(alice.address))
    //       .toString()
    //   ).to.changeTokenBalance(coinA, alice, expected);
    // });
  });
});
