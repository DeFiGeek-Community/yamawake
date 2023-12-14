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

describe("FeeDistributor", () => {
  const TEMPLATE_NAME = ethers.utils.formatBytes32String("SampleTemplate");

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
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_kill_fee_distro", () => {
    let accounts: SignerWithAddress[];
    beforeEach(async () => {
      const Distributor = await ethers.getContractFactory("FeeDistributor");
      feeDistributor = await Distributor.deploy(
        votingEscrow.address,
        factory.address,
        await time.latest(),
        alice.address,
        bob.address
      );
      await feeDistributor.deployed();
      accounts = await ethers.getSigners();
    });

    it("test_assumptions", async function () {
      expect(await feeDistributor.isKilled()).to.be.eq(0);
      expect(await feeDistributor.emergencyReturn()).to.equal(bob.address);
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
      const initialEthBob = await ethers.provider.getBalance(bob.address);
      await sendEther(feeDistributor.address, "1", alice);
      await coinA._mintForTesting(feeDistributor.address, 31337);
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);
      await feeDistributor.connect(alice).killMe();

      expect(await feeDistributor.emergencyReturn()).to.equal(bob.address);
      // Bob should receive 1 Ether
      expect(await ethers.provider.getBalance(bob.address)).to.eq(
        initialEthBob.add(ethers.utils.parseEther("1"))
      );
      // Tokens other than Ether should not be transfered by killing contract
      expect(await coinA.balanceOf(bob.address)).to.equal(0);
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
      const initialEthBob = await ethers.provider.getBalance(bob.address);

      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);

      await sendEther(feeDistributor.address, "1", alice);
      await coinA._mintForTesting(feeDistributor.address, 10000);
      await feeDistributor.connect(alice).killMe();

      await sendEther(feeDistributor.address, "1", alice);
      await coinA._mintForTesting(feeDistributor.address, 30000);
      await feeDistributor.connect(alice).killMe();

      expect(await feeDistributor.emergencyReturn()).to.equal(bob.address);
      // Bob should receive 1 Ether
      expect(await ethers.provider.getBalance(bob.address)).to.eq(
        initialEthBob.add(ethers.utils.parseEther("2"))
      );
      // Tokens other than Ether should not be transfered by killing contract
      expect(await coinA.balanceOf(bob.address)).to.equal(0);
    });

    for (let idx = 1; idx <= 2; idx++) {
      it(`test_only_admin_for_account_index_${idx}`, async function () {
        await expect(feeDistributor.connect(accounts[idx]).killMe()).to.be
          .reverted;
      });

      it(`test_cannot_claim_after_killed_for_account_index_${idx}`, async function () {
        await feeDistributor.connect(alice).killMe();
        await expect(
          feeDistributor.connect(accounts[idx])["claim(address)"](coinA.address)
        ).to.be.reverted;
      });

      it(`test_cannot_claim_for_after_killed_for_account_index_${idx}`, async function () {
        await feeDistributor.connect(alice).killMe();
        await expect(
          feeDistributor
            .connect(accounts[idx])
            ["claim(address,address)"](alice.address, coinA.address)
        ).to.be.reverted;
      });

      it(`test_cannot_claim_many_after_killed_for_account_index_${idx}`, async function () {
        await feeDistributor.connect(alice).killMe();
        await expect(
          feeDistributor
            .connect(accounts[idx])
            .claimMany(new Array(20).fill(alice.address), coinA.address)
        ).to.be.reverted;
      });
    }
  });
});
