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

  describe("test_kill_fee_distro", () => {
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

    it("test_kill", async function () {
      await feeDistributor.connect(alice).killMe();
      expect(await feeDistributor.isKilled()).to.be.eq(1);
    });

    it("test_multi_kill", async function () {
      await feeDistributor.connect(alice).killMe();
      await feeDistributor.connect(alice).killMe();
      expect(await feeDistributor.isKilled()).to.be.eq(1);
    });

    it("test_killing_transfers_tokens", async function () {
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

      const initialEthAlice = await ethers.provider.getBalance(alice.address);
      const tx = await feeDistributor.connect(alice).killMe();
      const receipt = await tx.wait();

      expect(await feeDistributor.admin()).to.equal(alice.address);
      // Alice should receive 1 Ether
      expect(await ethers.provider.getBalance(alice.address)).to.eq(
        initialEthAlice +
          ethers.parseEther("1") -
          receipt!.gasPrice * receipt!.gasUsed
      );
      // Tokens other than Ether should not be transfered by killing contract
      expect(await coinA.balanceOf(alice.address)).to.equal(0);
    });

    it("test_multi_kill_token_transfer", async function () {
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

      const initialEthAlice = await ethers.provider.getBalance(alice.address);
      await sendEther(feeDistributor.target, "1", bob);
      await coinA.connect(dan)._mintForTesting(feeDistributor.target, 10000);
      const tx1 = await feeDistributor.connect(alice).killMe();
      const receipt1 = await tx1.wait();

      await sendEther(feeDistributor.target, "1", bob);
      await coinA.connect(dan)._mintForTesting(feeDistributor.target, 30000);

      const tx2 = await feeDistributor.connect(alice).killMe();
      const receipt2 = await tx2.wait();

      expect(await feeDistributor.admin()).to.equal(alice.address);
      // Alice should receive 1 Ether
      expect(await ethers.provider.getBalance(alice.address)).to.eq(
        initialEthAlice +
          ethers.parseEther("2") -
          receipt1!.gasPrice * receipt1!.gasUsed -
          receipt2!.gasPrice * receipt2!.gasUsed
      );
      // Tokens other than Ether should not be transfered by killing contract
      expect(await coinA.balanceOf(alice.address)).to.equal(0);
    });

    for (let idx = 1; idx <= 2; idx++) {
      it(`test_only_admin_for_account_index_${idx}`, async function () {
        await expect(feeDistributor.connect(accounts[idx]).killMe()).to.be
          .reverted;
      });

      it(`test_cannot_claim_after_killed_for_account_index_${idx}`, async function () {
        await feeDistributor.connect(alice).killMe();
        await expect(
          feeDistributor.connect(accounts[idx])["claim(address)"](coinA.target)
        ).to.be.reverted;
      });

      it(`test_cannot_claim_for_after_killed_for_account_index_${idx}`, async function () {
        await feeDistributor.connect(alice).killMe();
        await expect(
          feeDistributor
            .connect(accounts[idx])
            ["claim(address,address)"](alice.address, coinA.target)
        ).to.be.reverted;
      });

      it(`test_cannot_claim_many_after_killed_for_account_index_${idx}`, async function () {
        await feeDistributor.connect(alice).killMe();
        await expect(
          feeDistributor
            .connect(accounts[idx])
            .claimMany(new Array(20).fill(alice.address), coinA.target)
        ).to.be.reverted;
      });
    }
  });
});
