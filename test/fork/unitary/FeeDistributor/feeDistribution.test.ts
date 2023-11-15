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

const DAY = 86400;
const WEEK = DAY * 7;
const TEMPLATE_NAME = ethers.utils.formatBytes32String("SampleTemplate");

describe("FeeDistributor", () => {
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

  type FundParams = {
    feeDistributor: Contract;
    auction?: Contract;
    token?: Contract;
    sender?: SignerWithAddress;
    amount?: string;
  };
  async function fundFeeDistributor(params: FundParams) {
    if (!params.auction || !params.token) {
      if (!params.sender) throw new Error("Sender required");
      await sendEther(
        feeDistributor.address,
        params.amount ? params.amount : "10",
        params.sender
      );
    } else {
      await coinA._mintForTesting(
        auction.address,
        ethers.utils.parseEther(params.amount ? params.amount : "10")
      );
      await auction.withdrawRaisedToken(params.token.address);
    }
  }

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob, charlie, dan] = await ethers.getSigners();

    const Distributor = await ethers.getContractFactory("FeeDistributor");
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

    feeDistributor = await Distributor.deploy(
      votingEscrow.address,
      factory.address,
      await time.latest(),
      alice.address,
      alice.address
    );
    await feeDistributor.deployed();
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_fee_distribution", () => {
    it(`test_eth_deposited_after`, async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));

      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 7; j++) {
          await sendEther(feeDistributor.address, "1", bob);
          await feeDistributor.checkpointToken(ethers.constants.AddressZero);
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
        feeDistributor
          .connect(alice)
          ["claim(address)"](ethers.constants.AddressZero)
      ).to.changeEtherBalance(alice, 0);
    });
    it(`test_token_deposited_after`, async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
      await coinA._mintForTesting(bob.address, ethers.utils.parseEther("100"));

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
            .transfer(feeDistributor.address, ethers.utils.parseEther("1"));
          // await fundFeeDistributor({
          //   feeDistributor,
          //   token: coinA,
          //   auction,
          //   amount: "1",
          // });
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

      expect(
        await feeDistributor.connect(alice)["claim(address)"](coinA.address)
      ).to.changeTokenBalance(coinA, alice, 0);
    });

    it("test_eth_deposited_during", async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));

      await time.increase(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);

      const Distributor = await ethers.getContractFactory("FeeDistributor");
      feeDistributor = await Distributor.deploy(
        votingEscrow.address,
        factory.address,
        await time.latest(),
        alice.address,
        alice.address
      );
      await feeDistributor.deployed();

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 7; j++) {
          await sendEther(feeDistributor.address, "1", bob);
          await feeDistributor.checkpointToken(ethers.constants.AddressZero);
          await feeDistributor.checkpointTotalSupply();
          await time.increase(DAY);
        }
      }

      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      const initBalanceAlice = await alice.getBalance();
      let tx = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.constants.AddressZero);
      let receipt = await tx.wait();
      let gas = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      const balanceAlice = await alice.getBalance();
      const diff = balanceAlice
        .sub(ethers.utils.parseEther("21"))
        .sub(initBalanceAlice)
        .add(gas)
        .abs();
      expect(diff).to.be.lessThan(10);
    });

    it("test_token_deposited_during", async function () {
      const amount = ethers.utils.parseEther("1000");
      await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
      await coinA._mintForTesting(bob.address, ethers.utils.parseEther("100"));

      await time.increase(WEEK);
      await votingEscrow
        .connect(alice)
        .createLock(amount, (await time.latest()) + 8 * WEEK);
      await time.increase(WEEK);

      const Distributor = await ethers.getContractFactory("FeeDistributor");
      feeDistributor = await Distributor.deploy(
        votingEscrow.address,
        factory.address,
        await time.latest(),
        alice.address,
        alice.address
      );
      await feeDistributor.deployed();

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
            .transfer(feeDistributor.address, ethers.utils.parseEther("1"));
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
        balanceAlice.sub(ethers.utils.parseEther("21")).toNumber()
      );
      expect(diff).to.be.lessThan(10);
    });

    // it("test_deposited_before", async function () {
    //   const [alice, bob] = await ethers.getSigners();
    //   const amount = ethers.utils.parseEther("1000");

    //   await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
    //   await coinA
    //     .connect(bob)
    //     ._mintForTesting(bob.address, ethers.utils.parseEther("100"));

    //   await votingEscrow
    //     .connect(alice)
    //     .createLock(amount, (await time.latest()) + 8 * WEEK);
    //   await time.increase(WEEK);
    //   const startTime = await time.latest();
    //   await time.increase(WEEK * 5);

    //   const Distributor = await ethers.getContractFactory("FeeDistributor");
    //   feeDistributor = await Distributor.deploy(
    //     votingEscrow.address,
    //     startTime,
    //     coinA.address,
    //     alice.address,
    //     alice.address
    //   );
    //   await feeDistributor.deployed();

    //   await coinA
    //     .connect(bob)
    //     .transfer(feeDistributor.address, ethers.utils.parseEther("10"));
    //   await feeDistributor.checkpointToken();
    //   await time.increase(WEEK);
    //   await feeDistributor.checkpointToken();
    //   await feeDistributor.connect(alice)["claim()"]();

    //   const balanceAlice = await coinA.balanceOf(alice.address);
    //   expect(
    //     Math.abs(balanceAlice.sub(ethers.utils.parseEther("10")).toNumber())
    //   ).to.be.lessThan(10);
    // });

    // it("test_deposited_twice", async function () {
    //   const amount = ethers.utils.parseEther("1000");

    //   await token.approve(votingEscrow.address, amount.mul(10));
    //   await coinA._mintForTesting(bob.address, ethers.utils.parseEther("100"));

    //   const currentTimestamp = await time.latest();
    //   await votingEscrow.createLock(amount, currentTimestamp + 4 * WEEK);

    //   await time.increase(WEEK);

    //   const startTime = await time.latest();

    //   await time.increase(3 * WEEK);

    //   await votingEscrow.connect(alice).withdraw();
    //   const excludeTime = Math.floor((await time.latest()) / WEEK) * WEEK;
    //   await votingEscrow
    //     .connect(alice)
    //     .createLock(amount, (await time.latest()) + 4 * WEEK);

    //   await time.increase(2 * WEEK);

    //   const Distributor = await ethers.getContractFactory("FeeDistributor");
    //   distributor = await Distributor.deploy(
    //     votingEscrow.address,
    //     startTime,
    //     coinA.address,
    //     alice.address,
    //     alice.address
    //   );
    //   await feeDistributor.deployed();

    //   await coinA
    //     .connect(bob)
    //     .transfer(feeDistributor.address, ethers.utils.parseEther("10"));
    //   await feeDistributor.checkpointToken();

    //   await time.increase(WEEK);

    //   await feeDistributor.checkpointToken();

    //   await feeDistributor.connect(alice)["claim()"]();

    //   const tokensToExclude = await feeDistributor.tokensPerWeek(excludeTime);

    //   expect(
    //     ethers.utils
    //       .parseEther("10")
    //       .sub(await coinA.balanceOf(alice.address))
    //       .sub(tokensToExclude)
    //   ).to.be.lt(10);
    // });

    // it("test_deposited_parallel", async function () {
    //   const amount = ethers.utils.parseEther("1000");

    //   await token.connect(alice).approve(votingEscrow.address, amount.mul(10));
    //   await token.connect(bob).approve(votingEscrow.address, amount.mul(10));
    //   await token.connect(alice).transfer(bob.address, amount);
    //   await coinA._mintForTesting(
    //     charlie.address,
    //     ethers.utils.parseEther("100")
    //   );

    //   const currentTimestamp = await time.latest();
    //   await votingEscrow
    //     .connect(alice)
    //     .createLock(amount, currentTimestamp + 8 * WEEK);
    //   await votingEscrow
    //     .connect(bob)
    //     .createLock(amount, currentTimestamp + 8 * WEEK);

    //   await time.increase(WEEK);

    //   const startTime = await time.latest();

    //   await time.increase(5 * WEEK);

    //   const Distributor = await ethers.getContractFactory("FeeDistributor");
    //   feeDistributor = await Distributor.deploy(
    //     votingEscrow.address,
    //     startTime,
    //     coinA.address,
    //     alice.address,
    //     alice.address
    //   );
    //   await feeDistributor.deployed();

    //   await coinA
    //     .connect(charlie)
    //     .transfer(feeDistributor.address, ethers.utils.parseEther("10"));
    //   await feeDistributor.checkpointToken();

    //   await time.increase(WEEK);

    //   await feeDistributor.checkpointToken();

    //   await feeDistributor.connect(alice)["claim()"]();
    //   await feeDistributor.connect(bob)["claim()"]();

    //   const balanceAlice = await coinA.balanceOf(alice.address);
    //   const balanceBob = await coinA.balanceOf(bob.address);

    //   expect(balanceAlice).to.equal(balanceBob);
    //   expect(balanceAlice.add(balanceBob)).to.be.closeTo(
    //     ethers.utils.parseEther("10"),
    //     20
    //   );
    // });
  });
});
