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
  FeeDistributor,
  MockToken,
  SampleTemplate,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

describe("FeeDistributorV1", () => {
  const DAY = 86400;
  const TEMPLATE_NAME = ethers.encodeBytes32String("SampleTemplate");

  let snapshot: SnapshotRestorer;
  let alice: SignerWithAddress, bob: SignerWithAddress;

  let feeDistributor: FeeDistributor;
  let votingEscrow: VotingEscrow;
  let factory: Factory;
  let auction: SampleTemplate;
  let token: YMWK;
  let coinA: MockToken;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob] = await ethers.getSigners();

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
    ])) as unknown as FeeDistributor;
    await feeDistributor.waitForDeployment();

    await coinA._mintForTesting(bob.address, ethers.parseEther("10"));

    await coinA.connect(bob).approve(factory.target, ethers.parseEther("10"));
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_getTokens", () => {
    const amount = ethers.parseEther("1000");
    it("should return the array of token addresses", async function () {
      let startTime = await time.latest();
      const FeeDistributor = await ethers.getContractFactory(
        "FeeDistributorV1",
        alice
      );
      feeDistributor = (await upgrades.deployProxy(FeeDistributor, [
        votingEscrow.target,
        factory.target,
        startTime,
      ])) as unknown as FeeDistributor;
      await feeDistributor.waitForDeployment();

      auction = await deploySampleSaleTemplate(
        factory,
        feeDistributor,
        token,
        coinA,
        TEMPLATE_NAME,
        bob
      );

      await sendEther(feeDistributor.target, "10", alice);
      await coinA._mintForTesting(auction.target, ethers.parseEther("10"));
      // Calling the mock function to add coinA to the reward list and transfer coinA from auction to feeDistributor
      await auction.withdrawRaisedToken(coinA.target);

      expect(await feeDistributor.getTokens()).to.deep.equal([
        ethers.ZeroAddress,
        coinA.target,
      ]);
    });
  });
});
