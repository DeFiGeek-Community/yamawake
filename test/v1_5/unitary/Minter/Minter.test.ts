import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import {
  takeSnapshot,
  SnapshotRestorer,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Minter", function () {
  let accounts: SignerWithAddress[];
  let minter: Contract;
  let votingEscrow: Contract;
  let gaugeController: Contract;
  let token: Contract;
  let gauge: Contract;

  let snapshot: SnapshotRestorer;

  const GAUGE_WEIGHT = BigNumber.from(10).pow(18);
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
    const GaugeController = await ethers.getContractFactory(
      "GaugeControllerV1"
    );
    const Minter = await ethers.getContractFactory("Minter");
    const Gauge = await ethers.getContractFactory("Gauge");

    token = await YMWK.deploy();
    await token.deployed();

    votingEscrow = await VotingEscrow.deploy(
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.deployed();

    gaugeController = await upgrades.deployProxy(GaugeController, [
      token.address,
      votingEscrow.address,
    ]);
    await gaugeController.deployed();

    minter = await Minter.deploy(token.address, gaugeController.address);
    await minter.deployed();

    gauge = await Gauge.deploy(minter.address);
    await gauge.deployed();

    // Set minter for the token
    await token.setMinter(minter.address);

    // Wait for the YMWK to start inflation
    await time.increase(INFLATION_DELAY);

    // Skip to the start of a new epoch week
    const currentWeek = Math.floor((await time.latest()) / WEEK) * WEEK;
    await time.increaseTo(currentWeek + WEEK);

    // Add gauge
    await gaugeController.addGauge(gauge.address, GAUGE_TYPE, GAUGE_WEIGHT);

    // YMWKを各アカウントに配布し、votingEscrowからの使用をapprove
    for (const account of accounts) {
      await token.transfer(account.address, ethers.utils.parseEther("1"));
      await token
        .connect(account)
        .approve(votingEscrow.address, ethers.utils.parseEther("1"));
    }
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  async function showWeeklyTokens() {
    const startTime: BigNumber = await gauge.startTime();
    let weekCursor = startTime;
    const latest: number = await time.latest();
    while (weekCursor.lt(latest)) {
      const tokenAmount = await gauge.tokensPerWeek(weekCursor);
      weekCursor = weekCursor.add(WEEK);
      console.log(
        `Week: ${weekCursor.div(
          WEEK
        )}, Token: ${tokenAmount.toString()}, RelativeWeight: ${(
          await gaugeController.gaugeRelativeWeight(gauge.address, weekCursor)
        ).toString()}`
      );
    }
  }

  describe("Minter Behavior", function () {
    // Test basic mint functionality
    it("test_mint", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(
          ethers.utils.parseEther("1"),
          (await time.latest()) + MONTH
        );

      await ethers.provider.send("evm_increaseTime", [MONTH]);

      await minter.connect(accounts[1]).mint(gauge.address); //gauge_address, msg.sender, mint
      // await showWeeklyTokens();
      let expected = await gauge.integrateFraction(accounts[1].address);

      expect(expected).to.be.gt(0);
      expect(await token.balanceOf(accounts[1].address)).to.equal(expected);
      expect(await minter.minted(accounts[1].address, gauge.address)).to.equal(
        expected
      );
    });

    // Test minting immediately after setup
    it("test_mint_immediate", async () => {
      let t0 = BigNumber.from(await time.latest());
      let moment = t0.add(WEEK).div(WEEK).mul(WEEK).add("5");

      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.utils.parseEther("1"), moment);

      await time.increaseTo(moment);

      //mint
      expect(await minter.minted(accounts[1].address, gauge.address)).to.equal(
        "0"
      );
      await minter.connect(accounts[1]).mint(gauge.address);

      //check
      let balance = await token.balanceOf(accounts[1].address);
      expect(await minter.minted(accounts[1].address, gauge.address)).to.equal(
        balance
      );
    });

    // Test multiple mint operations on the same gauge
    it("test_mint_multiple_same_gauge", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(
          ethers.utils.parseEther("1"),
          (await time.latest()) + MONTH * 2
        );
      await ethers.provider.send("evm_increaseTime", [MONTH]);

      await minter.connect(accounts[1]).mint(gauge.address);
      let balance = await token.balanceOf(accounts[1].address);

      await ethers.provider.send("evm_increaseTime", [MONTH]);

      await minter.connect(accounts[1]).mint(gauge.address);
      let expected = await gauge.integrateFraction(accounts[1].address);
      let final_balance = await token.balanceOf(accounts[1].address);

      // await showWeeklyTokens();

      expect(final_balance).to.be.gt(balance); //2nd mint success
      expect(final_balance).to.equal(expected); //2nd mint works fine
      expect(await minter.minted(accounts[1].address, gauge.address)).to.equal(
        expected
      ); //tracks fine
    });

    // Test minting after withdrawing
    it("test_mint_after_withdraw", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(
          ethers.utils.parseEther("1"),
          (await time.latest()) + WEEK * 2
        );

      await ethers.provider.send("evm_increaseTime", [WEEK * 2]);

      await votingEscrow.connect(accounts[1]).withdraw();
      await minter.connect(accounts[1]).mint(gauge.address);

      expect((await token.balanceOf(accounts[1].address)).gt(0)).to.equal(true);
    });

    // Test multiple mints after withdrawing
    it("test_mint_multiple_after_withdraw", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(ethers.utils.parseEther("1"), (await time.latest()) + WEEK);

      await ethers.provider.send("evm_increaseTime", [WEEK]);
      await votingEscrow.connect(accounts[1]).withdraw();
      await minter.connect(accounts[1]).mint(gauge.address);

      let balance = await token.balanceOf(accounts[1].address);

      await ethers.provider.send("evm_increaseTime", [10]);
      await minter.connect(accounts[1]).mint(gauge.address);

      expect(await token.balanceOf(accounts[1].address)).to.equal(balance);
    });

    // Test mint without any deposit
    it("test_no_deposit", async () => {
      const initialBalance = await token.balanceOf(accounts[1].address);
      await minter.connect(accounts[1]).mint(gauge.address);
      expect(await token.balanceOf(accounts[1].address)).to.equal(
        initialBalance
      );
      expect(await minter.minted(accounts[1].address, gauge.address)).to.equal(
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
      await votingEscrow
        .connect(accounts[1])
        .createLock(
          ethers.utils.parseEther("1"),
          (await time.latest()) + MONTH
        );
      const startEpochTime = await token.startEpochTime();
      const currentTime = BigNumber.from(await time.latest());
      const timeToSleep = startEpochTime.sub(currentTime).sub(5);
      await ethers.provider.send("evm_increaseTime", [timeToSleep.toNumber()]);

      await minter.connect(accounts[1]).mint(gauge.address);

      expect(await token.balanceOf(accounts[1].address)).to.equal(0);
      expect(await minter.minted(accounts[1].address, gauge.address)).to.equal(
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
        .createLock(
          ethers.utils.parseEther("1"),
          (await time.latest()) + MONTH
        );

      await ethers.provider.send("evm_increaseTime", [MONTH]);

      await minter.connect(accounts[1]).toggleApproveMint(accounts[2].address);
      expect(
        await minter.allowedToMintFor(accounts[2].address, accounts[1].address)
      ).to.equal(true);

      await minter
        .connect(accounts[2])
        .mintFor(gauge.address, accounts[1].address);

      let expected = await gauge.integrateFraction(accounts[1].address);
      expect(expected).to.be.gt(0);
      expect(await token.balanceOf(accounts[1].address)).to.equal(expected);
      expect(await minter.minted(accounts[1].address, gauge.address)).to.equal(
        expected
      );
    });

    // Test mintFor function when not approved
    it("test_mintForFail_function", async () => {
      await votingEscrow
        .connect(accounts[1])
        .createLock(
          ethers.utils.parseEther("1"),
          (await time.latest()) + MONTH
        );

      await ethers.provider.send("evm_increaseTime", [MONTH]);

      expect(
        await minter.allowedToMintFor(accounts[2].address, accounts[1].address)
      ).to.equal(false);

      await minter
        .connect(accounts[2])
        .mintFor(gauge.address, accounts[1].address);

      expect(await token.balanceOf(accounts[1].address)).to.equal(0);
      expect(await minter.minted(accounts[1].address, gauge.address)).to.equal(
        0
      );
    });
  });
});
