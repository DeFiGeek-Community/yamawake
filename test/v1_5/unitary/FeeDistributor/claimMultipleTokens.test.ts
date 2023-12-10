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

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_claim_multiple_tokens", () => {
    const amount = ethers.utils.parseEther("1000");
    it("test_claim_multiple", async function () {
      // ETHとcoinAの一括クレームが個別にクレームした場合と同じ残高になることを確認
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
      await feeDistributor.deployed();

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );

      await sendEther(feeDistributor.address, "10", alice);
      await coinA._mintForTesting(
        auction.address,
        ethers.utils.parseEther("10")
      );
      // Calling the mock function to add coinA to the reward list and transfer coinA from auction to feeDistributor
      await auction.withdrawRaisedToken(coinA.address);

      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      await feeDistributor.checkpointToken(coinA.address);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      await feeDistributor.checkpointToken(coinA.address);

      const snapshot = await takeSnapshot();

      let tx = await feeDistributor
        .connect(alice)
        .claimMultipleTokens(
          alice.address,
          [ethers.constants.AddressZero, coinA.address].concat(
            Array(18).fill(ethers.constants.AddressZero)
          )
        );
      let receipt = await tx.wait();
      let gas = receipt.effectiveGasPrice.mul(receipt.gasUsed);
      let balances = [
        (await alice.getBalance()).add(gas),
        await coinA.balanceOf(alice.address),
      ];

      await snapshot.restore();

      let tx1 = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.constants.AddressZero);
      let receipt1 = await tx1.wait();
      let gas1 = receipt1.effectiveGasPrice.mul(receipt1.gasUsed);
      let tx2 = await feeDistributor
        .connect(alice)
        ["claim(address)"](coinA.address);
      let receipt2 = await tx2.wait();
      let gas2 = receipt2.effectiveGasPrice.mul(receipt2.gasUsed);

      expect(balances).to.deep.equal([
        (await alice.getBalance()).add(gas1).add(gas2),
        await coinA.balanceOf(alice.address),
      ]);
    });
    it("test_claim_multiple_same", async function () {
      // ETHを複数一括クレームしても個別に一度クレームした場合と同じ残高になることを確認
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
      await feeDistributor.deployed();

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );

      await sendEther(feeDistributor.address, "10", alice);
      await coinA._mintForTesting(
        auction.address,
        ethers.utils.parseEther("10")
      );
      // Calling the mock function to add coinA to the reward list and transfer coinA from auction to feeDistributor
      await auction.withdrawRaisedToken(coinA.address);

      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      await feeDistributor.checkpointToken(coinA.address);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.constants.AddressZero);
      await feeDistributor.checkpointToken(coinA.address);

      const expected = await feeDistributor
        .connect(alice)
        .callStatic["claim(address)"](ethers.constants.AddressZero);

      await expect(
        feeDistributor
          .connect(alice)
          .claimMultipleTokens(
            alice.address,
            [
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
            ].concat(Array(17).fill(ethers.constants.AddressZero))
          )
      ).to.changeEtherBalance(alice, expected);
    });
  });
});
