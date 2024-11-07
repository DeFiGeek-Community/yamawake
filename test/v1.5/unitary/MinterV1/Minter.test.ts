import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  GaugeV1,
  GaugeControllerV1,
  MinterV1,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

describe("MinterV1", function () {
  let accounts: SignerWithAddress[];
  let minter: MinterV1;
  let votingEscrow: VotingEscrow;
  let gaugeController: GaugeControllerV1;
  let token: YMWK;
  let gauge: GaugeV1;

  let snapshot: SnapshotRestorer;
  let snapshotBeforeInflation: SnapshotRestorer;

  const GAUGE_WEIGHT = BigInt(1e18);
  const GAUGE_TYPE = 0;

  const DAY = 86400;
  const WEEK = DAY * 7;
  const MONTH = DAY * 30;
  const YEAR = DAY * 365;
  const INFLATION_DELAY = YEAR;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    accounts = await ethers.getSigners();

    const YMWK = await ethers.getContractFactory("YMWK");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const GaugeController =
      await ethers.getContractFactory("GaugeControllerV1");
    const Minter = await ethers.getContractFactory("MinterV1");
    const Gauge = await ethers.getContractFactory("GaugeV1");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    gaugeController = (await upgrades.deployProxy(GaugeController, [
      token.target,
      votingEscrow.target,
    ])) as unknown as GaugeControllerV1;
    await gaugeController.waitForDeployment();

    minter = (await upgrades.deployProxy(Minter, [
      token.target,
      gaugeController.target,
    ])) as unknown as MinterV1;
    await minter.waitForDeployment();

    const tokenInflationStarts =
      (await token.startEpochTime()) + BigInt(INFLATION_DELAY);
    gauge = (await upgrades.deployProxy(Gauge, [
      minter.target,
      tokenInflationStarts,
    ])) as unknown as GaugeV1;
    await gauge.waitForDeployment();

    // Set minter for the token
    await token.setMinter(minter.target);

    // Add gauge
    await gaugeController.addGauge(gauge.target, GAUGE_TYPE, GAUGE_WEIGHT);

    // YMWKを各アカウントに配布し、votingEscrowからの使用をapprove
    for (const account of accounts) {
      await token.transfer(account.address, ethers.parseEther("1"));
      await token
        .connect(account)
        .approve(votingEscrow.target, ethers.parseEther("1"));
    }

    snapshotBeforeInflation = await takeSnapshot();

    // Wait for the YMWK to start inflation
    await time.increase(INFLATION_DELAY);

    // Skip to the start of a new epoch week
    const currentWeek = Math.floor((await time.latest()) / WEEK) * WEEK;
    await time.increaseTo(currentWeek + WEEK);
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  async function showWeeklyTokens() {
    const startTime = await gauge.startTime();
    let weekCursor = Number(startTime);
    const latest: number = await time.latest();
    while (weekCursor < latest) {
      const tokenAmount = await gauge.tokensPerWeek(weekCursor);
      weekCursor = weekCursor + WEEK;
      console.log(
        `Week: ${
          weekCursor / WEEK
        }, Token: ${tokenAmount.toString()}, RelativeWeight: ${(
          await gaugeController.gaugeRelativeWeight(gauge.target, weekCursor)
        ).toString()}`
      );
    }
  }

  describe("Minter Behavior", function () {
    // Test basic mint functionality
    it("test_mint", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.parseEther("1"), (await time.latest()) + MONTH);

      await ethers.provider.send("evm_increaseTime", [MONTH]);

      await minter.connect(accounts[1]).mint(gauge.target); //gauge_address, msg.sender, mint
      // await showWeeklyTokens();
      let expected = await gauge.integrateFraction(accounts[1].address);

      expect(expected).to.be.gt(0);
      expect(await token.balanceOf(accounts[1].address)).to.equal(expected);
      expect(await minter.minted(accounts[1].address, gauge.target)).to.equal(
        expected
      );
    });

    // Test minting immediately after setup
    it("test_mint_immediate", async () => {
      let t0 = await time.latest();
      let moment = ((t0 + WEEK) / WEEK) * WEEK + 5;

      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.parseEther("1"), moment);

      await time.increaseTo(moment);

      //mint
      expect(await minter.minted(accounts[1].address, gauge.target)).to.equal(
        "0"
      );
      await minter.connect(accounts[1]).mint(gauge.target);

      //check
      let balance = await token.balanceOf(accounts[1].address);
      expect(await minter.minted(accounts[1].address, gauge.target)).to.equal(
        balance
      );
    });

    // Test multiple mint operations on the same gauge
    it("test_mint_multiple_same_gauge", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.parseEther("1"), (await time.latest()) + MONTH * 2);
      await ethers.provider.send("evm_increaseTime", [MONTH]);

      await minter.connect(accounts[1]).mint(gauge.target);
      let balance = await token.balanceOf(accounts[1].address);

      await ethers.provider.send("evm_increaseTime", [MONTH]);

      await minter.connect(accounts[1]).mint(gauge.target);
      let expected = await gauge.integrateFraction(accounts[1].address);
      let final_balance = await token.balanceOf(accounts[1].address);

      // await showWeeklyTokens();

      expect(final_balance).to.be.gt(balance); //2nd mint success
      expect(final_balance).to.equal(expected); //2nd mint works fine
      expect(await minter.minted(accounts[1].address, gauge.target)).to.equal(
        expected
      ); //tracks fine
    });

    // Test minting after withdrawing
    it("test_mint_after_withdraw", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.parseEther("1"), (await time.latest()) + WEEK * 2);

      await ethers.provider.send("evm_increaseTime", [WEEK * 2]);

      await votingEscrow.connect(accounts[1]).withdraw();
      await minter.connect(accounts[1]).mint(gauge.target);

      expect((await token.balanceOf(accounts[1].address)) > 0).to.equal(true);
    });

    // Test multiple mints after withdrawing
    it("test_mint_multiple_after_withdraw", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.parseEther("1"), (await time.latest()) + WEEK);

      await ethers.provider.send("evm_increaseTime", [WEEK]);
      await votingEscrow.connect(accounts[1]).withdraw();
      await minter.connect(accounts[1]).mint(gauge.target);

      let balance = await token.balanceOf(accounts[1].address);

      await ethers.provider.send("evm_increaseTime", [10]);
      await minter.connect(accounts[1]).mint(gauge.target);

      expect(await token.balanceOf(accounts[1].address)).to.equal(balance);
    });

    // Test mint without any deposit
    it("test_no_deposit", async () => {
      const initialBalance = await token.balanceOf(accounts[1].address);
      await minter.connect(accounts[1]).mint(gauge.target);
      expect(await token.balanceOf(accounts[1].address)).to.equal(
        initialBalance
      );
      expect(await minter.minted(accounts[1].address, gauge.target)).to.equal(
        0
      );
    });

    // Test minting with an invalid gauge address
    it("test_mint_not_a_gauge", async () => {
      await expect(minter.mint(accounts[1].address)).to.revertedWith(
        "dev: gauge is not added"
      );
    });

    // Test minting before inflation begins
    it("test_mint_before_inflation_begins", async function () {
      await snapshotBeforeInflation.restore();

      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.parseEther("1"), (await time.latest()) + MONTH);

      const timeToSleep = MONTH;
      await ethers.provider.send("evm_increaseTime", [timeToSleep]);

      await minter.connect(accounts[1]).mint(gauge.target);

      expect(await token.balanceOf(accounts[1].address)).to.equal(0);
      expect(await minter.minted(accounts[1].address, gauge.target)).to.equal(
        0
      );
    });

    // Test toggling of the mint approval function
    it("test_toggleApproveMint_function", async () => {
      await minter.connect(accounts[1]).toggleApproveMint(accounts[2].address);
      expect(
        await minter.allowedToMintFor(accounts[2].address, accounts[1].address)
      ).to.equal(true);

      await minter.connect(accounts[1]).toggleApproveMint(accounts[2].address);
      expect(
        await minter.allowedToMintFor(accounts[2].address, accounts[1].address)
      ).to.equal(false);
    });

    // Test minting on behalf of another user
    it("test_mintFor_function", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.parseEther("1"), (await time.latest()) + MONTH);

      await ethers.provider.send("evm_increaseTime", [MONTH]);

      await minter.connect(accounts[1]).toggleApproveMint(accounts[2].address);
      expect(
        await minter.allowedToMintFor(accounts[2].address, accounts[1].address)
      ).to.equal(true);

      await minter
        .connect(accounts[2])
        .mintFor(gauge.target, accounts[1].address);

      let expected = await gauge.integrateFraction(accounts[1].address);
      expect(expected).to.be.gt(0);
      expect(await token.balanceOf(accounts[1].address)).to.equal(expected);
      expect(await minter.minted(accounts[1].address, gauge.target)).to.equal(
        expected
      );
    });

    // Test mintFor function when not approved
    it("test_mintForFail_function", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.parseEther("1"), (await time.latest()) + MONTH);

      await ethers.provider.send("evm_increaseTime", [MONTH]);

      expect(
        await minter.allowedToMintFor(accounts[2].address, accounts[1].address)
      ).to.equal(false);

      await minter
        .connect(accounts[2])
        .mintFor(gauge.target, accounts[1].address);

      expect(await token.balanceOf(accounts[1].address)).to.equal(0);
      expect(await minter.minted(accounts[1].address, gauge.target)).to.equal(
        0
      );
    });
  });
});
