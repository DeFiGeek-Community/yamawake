const { expect } = require("chai");
const { ethers } = require("hardhat");
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { sendEther, timeTravel, deploySaleTemplate } from "./scenarioHelper";

describe("SampleTemplateWithCreationFee", function () {
  const templateName = ethers.utils.formatBytes32String(
    "SampleTemplateWithCreationFee",
  );
  const initialSupply = ethers.utils.parseEther("1000");

  const DAY = 24 * 60 * 60;

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

  async function deployDistributorFixture() {
    const { factory, feePool, owner, addr1, addr2 } = await loadFixture(
      deployFactoryAndFeePoolFixture,
    );
    const YMWK = await ethers.getContractFactory("YMWK");
    const ymwk = await YMWK.deploy();
    await ymwk.deployed();

    const Distributor = await ethers.getContractFactory("Distributor");
    const distributor = await Distributor.deploy(factory.address, ymwk.address);
    await distributor.deployed();

    return { factory, feePool, distributor, ymwk, owner, addr1, addr2 };
  }

  async function deployFactoryAndTemplateFixture() {
    const { factory, feePool, distributor, ymwk, owner, addr1, addr2 } =
      await loadFixture(deployDistributorFixture);

    const Template = await ethers.getContractFactory(
      "SampleTemplateWithCreationFee",
    );
    const template = await Template.deploy(
      factory.address,
      feePool.address,
      distributor.address,
    );
    await template.deployed();

    await factory.addTemplate(
      templateName,
      template.address,
      Template.interface.getSighash("initialize"),
      Template.interface.getSighash("initializeTransfer"),
    );

    return {
      factory,
      feePool,
      distributor,
      ymwk,
      template,
      owner,
      addr1,
      addr2,
    };
  }

  async function deployTokenFixture() {
    const Token = await ethers.getContractFactory("SampleToken");
    const token = await Token.deploy(initialSupply);
    await token.deployed();

    return { token };
  }

  describe("initialize", function () {
    // 正しいCreation feeを送付した場合のセール立ち上げ操作
    it("initialize_success_1", async function () {
      const { factory, owner, feePool } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.utils.parseEther("1");
      const minRaisedAmount = "0";
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount = initialSupply;
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const abiCoder = ethers.utils.defaultAbiCoder;
      const args = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [
          owner.address,
          now + DAY,
          DAY,
          token.address,
          allocatedAmount,
          minRaisedAmount,
        ],
      );

      await expect(
        factory.deployAuction(templateName, args, {
          value: ethers.utils.parseEther("0.1"),
        }),
      ).to.not.be.reverted;
      await expect(
        await ethers.provider.getBalance(feePool.address),
      ).to.be.equal(ethers.utils.parseEther("0.1"));
    });

    // 正しくない額のCreation feeを送付した場合のセール立ち上げ操作
    it("initialize_fail_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.utils.parseEther("1");
      const minRaisedAmount = "0";
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount = initialSupply;
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const abiCoder = ethers.utils.defaultAbiCoder;
      const args = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [
          owner.address,
          now + DAY,
          DAY,
          token.address,
          allocatedAmount,
          minRaisedAmount,
        ],
      );

      await expect(
        factory.deployAuction(templateName, args, {
          value: ethers.utils.parseEther("0.2"),
        }),
      ).to.be.revertedWith("The creation fee must be 0.1 ETH");
    });
  });
});
