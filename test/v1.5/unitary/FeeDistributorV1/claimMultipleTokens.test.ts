import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { sendEther, deploySampleSaleTemplate } from "../../../scenarioHelper";
import {
  Factory,
  FeeDistributorV1,
  MockToken,
  SampleTemplate,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

describe("FeeDistributorV1", () => {
  const DAY = 86400;
  const WEEK = DAY * 7;
  const TEMPLATE_NAME = ethers.encodeBytes32String("SampleTemplate");

  let snapshot: SnapshotRestorer;
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
      "vetoken"
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

    await coinA._mintForTesting(dan.address, ethers.parseEther("10"));

    await coinA.connect(dan).approve(factory.target, ethers.parseEther("10"));
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_claim_multiple_tokens", () => {
    const amount = ethers.parseEther("1000");
    it("test_claim_multiple", async function () {
      // ETHとcoinAの一括クレームが個別にクレームした場合と同じ残高になることを確認
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

      await sendEther(feeDistributor.target, "10", alice);
      await coinA._mintForTesting(auction.target, ethers.parseEther("10"));
      // Calling the mock function to add coinA to the reward list and transfer coinA from auction to feeDistributor
      await auction.withdrawRaisedToken(coinA.target);

      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      await feeDistributor.checkpointToken(coinA.target);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      await feeDistributor.checkpointToken(coinA.target);

      const snapshot = await takeSnapshot();

      let tx = await feeDistributor
        .connect(alice)
        .claimMultipleTokens(
          alice.address,
          [ethers.ZeroAddress, coinA.target].concat(
            Array(18).fill(ethers.ZeroAddress)
          )
        );
      let receipt = await tx.wait();
      let gas = receipt!.gasPrice * receipt!.gasUsed;
      let balances = [
        (await ethers.provider.getBalance(alice)) + gas,
        await coinA.balanceOf(alice.address),
      ];

      await snapshot.restore();

      let tx1 = await feeDistributor
        .connect(alice)
        ["claim(address)"](ethers.ZeroAddress);
      let receipt1 = await tx1.wait();
      let gas1 = receipt1!.gasPrice * receipt1!.gasUsed;
      let tx2 = await feeDistributor
        .connect(alice)
        ["claim(address)"](coinA.target);
      let receipt2 = await tx2.wait();
      let gas2 = receipt2!.gasPrice * receipt2!.gasUsed;

      expect(balances).to.deep.equal([
        (await ethers.provider.getBalance(alice)) + gas1 + gas2,
        await coinA.balanceOf(alice.address),
      ]);
    });
    it("test_claim_multiple_same", async function () {
      // ETHを複数一括クレームしても個別に一度クレームした場合と同じ残高になることを確認
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

      await sendEther(feeDistributor.target, "10", alice);
      await coinA._mintForTesting(auction.target, ethers.parseEther("10"));
      // Calling the mock function to add coinA to the reward list and transfer coinA from auction to feeDistributor
      await auction.withdrawRaisedToken(coinA.target);

      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      await feeDistributor.checkpointToken(coinA.target);
      await time.increase(WEEK);
      await feeDistributor.checkpointToken(ethers.ZeroAddress);
      await feeDistributor.checkpointToken(coinA.target);

      const expected = await feeDistributor
        .connect(alice)
        ["claim(address)"].staticCall(ethers.ZeroAddress);

      await expect(
        feeDistributor
          .connect(alice)
          .claimMultipleTokens(
            alice.address,
            [ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress].concat(
              Array(17).fill(ethers.ZeroAddress)
            )
          )
      ).to.changeEtherBalance(alice, expected);
    });
  });
});
