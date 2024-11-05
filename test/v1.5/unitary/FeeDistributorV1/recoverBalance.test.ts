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

describe("FeeDistributorV1", () => {
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
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_recover_balance", () => {
    let accounts: SignerWithAddress[];
    beforeEach(async () => {
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

      await sendEther(feeDistributor.target, "1", bob);
      await coinA.connect(dan)._mintForTesting(feeDistributor.target, 31337);
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.target);

      expect(await feeDistributor.admin()).to.equal(alice.address);

      const initialEthAlice = await ethers.provider.getBalance(alice.address);
      const tx = await feeDistributor
        .connect(alice)
        .recoverBalance(ethers.ZeroAddress);
      const receipt = await tx.wait();

      expect(await ethers.provider.getBalance(alice.address)).to.eq(
        initialEthAlice +
          ethers.parseEther("1") -
          receipt!.gasPrice * receipt!.gasUsed
      );

      await feeDistributor.connect(alice).recoverBalance(coinA.target);
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
      await coinA._mintForTesting(feeDistributor.target, 31337);
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.target);

      await feeDistributor.connect(alice).killMe();

      expect(await feeDistributor.admin()).to.equal(alice.address);

      expect(await coinA.balanceOf(alice.address)).to.equal(0);
      await feeDistributor.connect(alice).recoverBalance(coinA.target);
      expect(await coinA.balanceOf(alice.address)).to.equal(31337);
    });
  });
});
