import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { sendEther } from "./scenarioHelper";

describe("FeePool", function () {
  const initialSupply = ethers.parseEther("1000");

  async function deployFactoryAndFeePoolFixture() {
    const [owner, addr1, addr2] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("Factory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();
    const FeePool = await ethers.getContractFactory("FeePool");
    const feePool = await FeePool.deploy();
    await feePool.waitForDeployment();

    return { factory, feePool, owner, addr1, addr2 };
  }

  async function deployTokenFixture() {
    const Token = await ethers.getContractFactory("SampleToken");
    const token = await Token.deploy(initialSupply);
    await token.waitForDeployment();

    return { token };
  }

  describe("withdrawEther", function () {
    // 正常な手数料回収
    it("withdrawEther_success_1", async function () {
      const { feePool, owner } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      sendEther(feePool.target, "1", owner);
      await expect(
        feePool.connect(owner).withdrawEther(owner.address)
      ).to.changeEtherBalances(
        [feePool, owner],
        [`-${ethers.parseEther("1")}`, ethers.parseEther("1")]
      );
    });

    // Nullアドレスへの手数料回収
    it("withdrawEther_fail_1", async function () {
      const { feePool, owner } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      sendEther(feePool.target, "1", owner);
      await expect(
        feePool.connect(owner).withdrawEther(ethers.ZeroAddress)
      ).to.be.revertedWith("Don't discard treasury!");
    });

    // オーナー以外の手数料回収
    it("withdrawEther_fail_2", async function () {
      const { feePool, owner, addr1 } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      sendEther(feePool.target, "1", owner);
      await expect(feePool.connect(addr1).withdrawEther(addr1.address)).to.be
        .reverted;
    });
  });

  describe("withdrawToken", function () {
    // 正常な手数料回収
    it("withdrawToken_success_1", async function () {
      const { feePool, owner } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      const { token } = await loadFixture(deployTokenFixture);
      const amount = ethers.parseEther("1");
      await token.transfer(feePool.target, amount);

      await expect(
        feePool
          .connect(owner)
          .withdrawToken(owner.address, [await token.getAddress()])
      ).to.changeTokenBalances(
        token,
        [feePool, owner],
        [`-${ethers.parseEther("1")}`, ethers.parseEther("1")]
      );
    });

    // Nullアドレスへの手数料回収
    it("withdrawToken_fail_1", async function () {
      const { feePool, owner } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      const { token } = await loadFixture(deployTokenFixture);
      const amount = ethers.parseEther("1");
      await token.transfer(feePool.target, amount);
      await expect(
        feePool
          .connect(owner)
          .withdrawToken(ethers.ZeroAddress, [await token.getAddress()])
      ).to.be.revertedWith("Don't discard treasury!");
    });

    // オーナー以外の手数料回収
    it("withdrawToken_fail_2", async function () {
      const { feePool, owner, addr1 } = await loadFixture(
        deployFactoryAndFeePoolFixture
      );
      const { token } = await loadFixture(deployTokenFixture);
      const amount = ethers.parseEther("1");
      await token.transfer(feePool.target, amount);
      await expect(feePool.connect(addr1).withdrawEther(addr1.address)).to.be
        .reverted;
    });
  });
});
