import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { deploySampleSaleTemplate } from "../../../scenarioHelper";

const TEMPLATE_NAME = ethers.utils.formatBytes32String("SampleTemplate");

describe("FeeDistributor", () => {
  let alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    dan: SignerWithAddress;

  let distributor: Contract;
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
      distributor = await Distributor.deploy(
        factory.address,
        votingEscrow.address,
        await time.latest(),
        alice.address,
        bob.address
      );
      await distributor.deployed();
      accounts = await ethers.getSigners();
    });

    it("test_assumptions", async function () {
      expect(await distributor.isKilled()).to.be.false;
      expect(await distributor.emergencyReturn()).to.equal(bob.address);
    });

    it("test_kill", async function () {
      await distributor.connect(alice).killMe();
      expect(await distributor.isKilled()).to.be.true;
    });

    it("test_multi_kill", async function () {
      await distributor.connect(alice).killMe();
      await distributor.connect(alice).killMe();
      expect(await distributor.isKilled()).to.be.true;
    });

    it("test_killing_transfers_tokens", async function () {
      auction = await deploySampleSaleTemplate(
        factory,
        distributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      await coinA._mintForTesting(distributor.address, 31337);
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);
      await distributor.connect(alice).killMe();

      expect(await distributor.emergencyReturn()).to.equal(bob.address);
      expect(await coinA.balanceOf(bob.address)).to.equal(31337);
    });

    it("test_multi_kill_token_transfer", async function () {
      auction = await deploySampleSaleTemplate(
        factory,
        distributor,
        token,
        coinA,
        TEMPLATE_NAME,
        dan
      );
      await coinA._mintForTesting(distributor.address, 31337);
      // Calling the mock function to add coinA to the reward list
      await auction.withdrawRaisedToken(coinA.address);
      await coinA._mintForTesting(distributor.address, 10000);
      await distributor.connect(alice).killMe();

      await coinA._mintForTesting(distributor.address, 30000);
      await distributor.connect(alice).killMe();

      expect(await distributor.emergencyReturn()).to.equal(bob.address);
      expect(await coinA.balanceOf(bob.address)).to.equal(40000);
    });

    for (let idx = 1; idx <= 2; idx++) {
      it(`test_only_admin_for_account_index_${idx}`, async function () {
        await expect(distributor.connect(accounts[idx]).killMe()).to.be
          .reverted;
      });

      it(`test_cannot_claim_after_killed_for_account_index_${idx}`, async function () {
        await distributor.connect(alice).killMe();
        await expect(
          distributor.connect(accounts[idx])["claim(address)"](coinA.address)
        ).to.be.reverted;
      });

      it(`test_cannot_claim_for_after_killed_for_account_index_${idx}`, async function () {
        await distributor.connect(alice).killMe();
        await expect(
          distributor
            .connect(accounts[idx])
            ["claim(address, address)"](alice.address, coinA.address)
        ).to.be.reverted;
      });

      it(`test_cannot_claim_many_after_killed_for_account_index_${idx}`, async function () {
        await distributor.connect(alice).killMe();
        await expect(
          distributor
            .connect(accounts[idx])
            .claimMany(new Array(20).fill(alice.address), coinA.address)
        ).to.be.reverted;
      });
    }
  });
});
