import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { sendEther, deploySaleTemplate, timeTravel } from "./scenarioHelper";

describe("YMWK", function () {
  const DAY = 24 * 60 * 60;
  const YEAR = DAY * 365;

  async function deployYMWKFixture() {
    const YMWK = await ethers.getContractFactory("YMWK");
    const ymwk = await YMWK.deploy();
    await ymwk.waitForDeployment();
    return { ymwk };
  }

  describe("constructor", function () {
    // 初期設定
    it("constructor_success_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const now = await time.latest();
      const signers = await ethers.getSigners();

      await expect(await ymwk.balanceOf(signers[0].address)).to.be.equal(
        ethers.parseEther("450000000")
      );
      await expect(await ymwk.totalSupply()).to.be.equal(
        ethers.parseEther("450000000")
      );
      await expect(await ymwk.name()).to.be.equal("Yamawake DAO Token");
      await expect(await ymwk.symbol()).to.be.equal("YMWK");
      await expect(await ymwk.decimals()).to.be.equal(18);
      await expect(await ymwk.miningEpoch()).to.be.equal(-1);
      await expect(await ymwk.startEpochTime()).to.be.equal(now + YEAR - YEAR);
      await expect(await ymwk.rate()).to.be.equal(0);
    });
  });

  describe("setMinter", function () {
    // Minterの設定
    it("setMinter_success_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      await ymwk.setMinter(addr1.address);

      await expect(await ymwk.minter()).to.be.equal(addr1.address);
    });

    // Owner以外からのMinterの設定
    it("setMinter_fail_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();

      await expect(ymwk.connect(addr1).setMinter(addr1.address)).to.be.reverted;
    });

    // Minterがすでに設定されている場合のMinterの設定
    it("setMinter_fail_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      await ymwk.setMinter(addr1.address);

      await expect(ymwk.setMinter(addr1.address)).to.be.reverted;
    });

    // ゼロアドレスをMinterに設定
    it("setMinter_success_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      await ymwk.setMinter(ethers.ZeroAddress);

      await expect(await ymwk.minter()).to.be.equal(ethers.ZeroAddress);
    });
  });

  describe("setAdmin", function () {
    // Adminの設定
    it("setAdmin_success_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      await ymwk.setAdmin(addr1.address);

      await expect(await ymwk.admin()).to.be.equal(addr1.address);
    });

    // Owner以外からのAdminの設定
    it("setAdmin_fail_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();

      await expect(ymwk.connect(addr1).setAdmin(addr1.address)).to.be.reverted;
    });

    // Adminがすでに設定されている場合のAdminの設定
    it("setAdmin_success_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      await ymwk.setAdmin(addr1.address);
      await ymwk.connect(addr1).setAdmin(addr2.address);

      await expect(await ymwk.admin()).to.be.equal(addr2.address);
    });

    // ゼロアドレスをAdminに設定
    it("setAdmin_fail_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      await ymwk.setAdmin(ethers.ZeroAddress);

      await expect(await ymwk.admin()).to.be.equal(ethers.ZeroAddress);
    });
  });

  describe("mint", function () {
    // MinterからのMint
    it("mint_success_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      await ymwk.setMinter(addr1.address);
      await timeTravel(YEAR + 1);
      await ymwk.updateMiningParameters();
      const availableSupply = await ymwk.availableSupply();
      const totalSupply = await ymwk.totalSupply();
      const amount = availableSupply - totalSupply;

      await expect(
        ymwk.connect(addr1).mint(addr1.address, amount)
      ).to.changeTokenBalance(ymwk, addr1, amount);
    });

    // Minter以外からのMint
    it("mint_fail_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      const amount = ethers.parseEther("1");
      await ymwk.setMinter(addr1.address);

      await expect(ymwk.mint(addr1.address, amount)).to.be.reverted;
    });

    // ゼロアドレスへのmint
    it("mint_fail_2", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      const [owner, addr1, addr2] = await ethers.getSigners();
      const amount = ethers.parseEther("1");
      await ymwk.setMinter(addr1.address);

      await expect(ymwk.connect(addr1).mint(ethers.ZeroAddress, amount)).to.be
        .reverted;
    });
  });

  describe("updateMiningParameters", function () {
    it("updateMiningParameters_fail_1", async function () {
      const { ymwk } = await loadFixture(deployYMWKFixture);
      await expect(ymwk.updateMiningParameters()).to.be.reverted;
      await timeTravel(YEAR);
      await expect(ymwk.updateMiningParameters()).to.not.be.reverted;
    });

    // 235年目までの供給量
    it("updateMiningParameters_success_1", async function () {
      const firstYearInfration = 1744038559107052257n;
      const reductionRate = 1111111111111111111n;
      const rateDenominator = 10n ** 18n;
      const { ymwk } = await loadFixture(deployYMWKFixture);

      await timeTravel(YEAR);

      const startTime = await time.latest();

      await ymwk.updateMiningParameters();

      let currentRate = await ymwk.rate();
      await expect(currentRate.toString()).to.be.equal(firstYearInfration);
      let localRate = firstYearInfration;
      for (let i = 1n; i < 236; i++) {
        await timeTravel(YEAR);
        await ymwk.updateMiningParameters();
        currentRate = await ymwk.rate();
        localRate = (localRate * rateDenominator) / reductionRate;
        await expect(currentRate.toString()).to.be.equal(localRate);
      }

      const endTime = await time.latest();
      const availableSupplyAtLast = await ymwk.availableSupply();
      const mintableIn235 = await ymwk.mintableInTimeframe(startTime, endTime);

      await expect(availableSupplyAtLast).to.be.above(
        ethers.parseEther("999999999")
      );
      await expect(availableSupplyAtLast).to.be.below(
        ethers.parseEther("1000000000")
      );
      await expect(mintableIn235).to.be.above(ethers.parseEther("549999820"));
      await expect(mintableIn235).to.be.below(ethers.parseEther("549999823"));
    });
  });
});
