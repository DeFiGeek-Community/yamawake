const { expect } = require("chai");
const { ethers } = require("hardhat");
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { sendEther } from "./scenarioHelper";

describe("FeePool", function () {
  const initialSupply = ethers.utils.parseEther("1000");

  async function deployFactoryAndFeePoolFixture() {
    const [owner, addr1, addr2] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("Factory");
    const factory = await Factory.deploy();
    await factory.deployed();
    const FeePool = await ethers.getContractFactory("FeePool");
    const feePool = await FeePool.deploy();
    await feePool.deployed();

    return { factory, feePool, owner, addr1, addr2 };
  }

  async function deployTokenFixture() {
    const Token = await ethers.getContractFactory("SampleToken");
    const token = await Token.deploy(initialSupply);
    await token.deployed();

    return { token };
  }

  describe("withdrawEther", function () {
    // 正常な手数料回収
    it("withdrawEther_success_1", async function () {
      const { feePool, owner } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      sendEther(feePool.address, "1", owner);
      expect(
        await feePool.connect(owner).withdrawEther(owner.address)
      ).to.changeEtherBalances(
        [feePool, owner],
        [ethers.utils.parseEther("1"), `-${ethers.utils.parseEther("1")}`]
      );
    });

    // Nullアドレスへの手数料回収
    it("withdrawEther_fail_1", async function () {
      const { feePool, owner } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      sendEther(feePool.address, "1", owner);
      expect(
        feePool.connect(owner).withdrawEther(ethers.constants.AddressZero)
      ).to.be.revertedWith("Don't discard treasury!");
    });

    // オーナー以外の手数料回収
    it("withdrawEther_fail_2", async function () {
      const { feePool, owner, addr1 } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      sendEther(feePool.address, "1", owner);
      expect(feePool.connect(addr1).withdrawEther(addr1)).to.be.reverted;
    });
  });

  describe("withdrawToken", function () {
    // 正常な手数料回収
    it("withdrawToken_success_1", async function () {
      const { feePool, owner } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      const { token } = await loadFixture(deployTokenFixture);
      const amount = ethers.utils.parseEther("1");
      await token.transfer(feePool.address, amount);

      await expect(
        feePool.connect(owner).withdrawToken(owner.address, [token.address])
      ).to.changeTokenBalances(
        token,
        [feePool, owner],
        [`-${ethers.utils.parseEther("1")}`, ethers.utils.parseEther("1")]
      );
    });

    // Nullアドレスへの手数料回収
    it("withdrawToken_fail_1", async function () {
      const { feePool, owner } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      const { token } = await loadFixture(deployTokenFixture);
      const amount = ethers.utils.parseEther("1");
      await token.transfer(feePool.address, amount);
      await expect(
        feePool
          .connect(owner)
          .withdrawToken(ethers.constants.AddressZero, [token.address])
      ).to.be.revertedWith("Don't discard treasury!");
    });

    // オーナー以外の手数料回収
    it("withdrawToken_fail_2", async function () {
      const { feePool, owner, addr1 } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      const { token } = await loadFixture(deployTokenFixture);
      const amount = ethers.utils.parseEther("1");
      await token.transfer(feePool.address, amount);
      expect(feePool.connect(addr1).withdrawEther(addr1)).to.be.reverted;
    });
  });
});
