const { expect } = require("chai");
const { ethers } = require("hardhat");
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { sendEther, deploySaleTemplate, timeTravel } from "./scenarioHelper";

describe("YMWK", function () {
  const DAY = 24 * 60 * 60;
  const YEAR = DAY * 365;

  async function deployYMWKFixture() {
    const YMWK = await ethers.getContractFactory("YMWK");
    const ymwk = await YMWK.deploy();
    await ymwk.deployed();
    return { ymwk };
  }

  describe("constructor", function () {
    // 初期設定
    it("constructor_success_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const now = await time.latest();

      await expect(await ymwk.totalSupply()).to.be.equal(
        ethers.utils.parseEther("450000000"),
      );
      await expect(await ymwk.name()).to.be.equal("Yamawake DAO Token");
      await expect(await ymwk.symbol()).to.be.equal("YMWK");
      await expect(await ymwk.decimals()).to.be.equal(18);
      await expect(await ymwk.mining_epoch()).to.be.equal(-1);
      await expect(await ymwk.start_epoch_time()).to.be.equal(
        now + YEAR - YEAR,
      );
      await expect(await ymwk.rate()).to.be.equal(0);
    });
  });

  describe("set_minter", function () {
    // Minterの設定
    it("set_minter_success_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      await ymwk.set_minter(addr1.address);

      await expect(await ymwk.minter()).to.be.equal(addr1.address);
    });

    // Owner以外からのMinterの設定
    it("set_minter_fail_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();

      await expect(ymwk.connect(addr1).set_minter(addr1.address)).to.be
        .reverted;
    });

    // Minterがすでに設定されている場合のMinterの設定
    it("set_minter_fail_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      await ymwk.set_minter(addr1.address);

      await expect(ymwk.set_minter(addr1.address)).to.be.reverted;
    });

    // ゼロアドレスをMinterに設定
    it("set_minter_success_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      await ymwk.set_minter(ethers.constants.AddressZero);

      await expect(await ymwk.minter()).to.be.equal(
        ethers.constants.AddressZero,
      );
    });
  });

  describe("set_admin", function () {
    // Adminの設定
    it("set_admin_success_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      await ymwk.set_admin(addr1.address);

      await expect(await ymwk.admin()).to.be.equal(addr1.address);
    });

    // Owner以外からのAdminの設定
    it("set_admin_fail_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();

      await expect(ymwk.connect(addr1).set_admin(addr1.address)).to.be.reverted;
    });

    // Adminがすでに設定されている場合のAdminの設定
    it("set_admin_success_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      await ymwk.set_admin(addr1.address);
      await ymwk.connect(addr1).set_admin(addr2.address);

      await expect(await ymwk.admin()).to.be.equal(addr2.address);
    });

    // ゼロアドレスをAdminに設定
    it("set_admin_fail_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      await ymwk.set_admin(ethers.constants.AddressZero);

      await expect(await ymwk.admin()).to.be.equal(
        ethers.constants.AddressZero,
      );
    });
  });

  describe("mint", function () {
    // MinterからのMint
    it("mint_success_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      const amount = ethers.utils.parseEther("1");
      await ymwk.set_minter(addr1.address);

      await expect(
        await ymwk.connect(addr1).mint(addr1.address, amount),
      ).to.be.changeTokenBalance(ymwk, addr1, amount);
    });

    // Minter以外からのMint
    it("mint_fail_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      const amount = ethers.utils.parseEther("1");
      await ymwk.set_minter(addr1.address);

      await expect(ymwk.mint(addr1.address, amount)).to.be.reverted;
    });

    // ゼロアドレスへのmint
    it("mint_fail_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      const amount = ethers.utils.parseEther("1");
      await ymwk.set_minter(addr1.address);

      await expect(
        ymwk.connect(addr1).mint(ethers.constants.AddressZero, amount),
      ).to.be.reverted;
    });
  });

  describe("update_mining_parameters", function () {
    it("update_mining_parameters_fail_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      expect(ymwk.update_mining_parameters()).to.be.reverted;
      await timeTravel(YEAR);
      expect(ymwk.update_mining_parameters()).to.not.be.reverted;
    });

    // 235年目までの供給量
    it("update_mining_parameters_success_1", async function () {
      const firstYearInfration = 1744038559107052257n;
      const reductionRate = 1111111111111111111n;
      const rateDenominator = 10n ** 18n;
      const { ymwk } = await loadFixture(deployYMWKFixture);

      await timeTravel(YEAR);

      const startTime = time.latest();

      await ymwk.update_mining_parameters();

      let currentRate = await ymwk.rate();
      await expect(currentRate.toString()).to.be.equal(firstYearInfration);
      let localRate = firstYearInfration;
      for (let i = 1n; i < 236; i++) {
        await timeTravel(YEAR);
        await ymwk.update_mining_parameters();
        currentRate = await ymwk.rate();
        localRate = (localRate * rateDenominator) / reductionRate;
        await expect(currentRate.toString()).to.be.equal(localRate);
      }

      const endTime = time.latest();
      const availableSupplyAtLast = await ymwk.available_supply();
      const mintableIn235 = await ymwk.mintable_in_timeframe(
        startTime,
        endTime,
      );

      await expect(availableSupplyAtLast).to.be.above(
        ethers.utils.parseEther("999999999"),
      );
      await expect(availableSupplyAtLast).to.be.below(
        ethers.utils.parseEther("1000000000"),
      );
      await expect(mintableIn235).to.be.above(
        ethers.utils.parseEther("549999820"),
      );
      await expect(mintableIn235).to.be.below(
        ethers.utils.parseEther("549999823"),
      );
    });
  });
});
