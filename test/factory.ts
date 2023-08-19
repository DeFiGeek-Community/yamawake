const { expect } = require("chai");
const { ethers } = require("hardhat");
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("Yamawake Dapp", function () {
  const templateName = ethers.utils.formatBytes32String("TemplateV1");
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
    const YMWK = await ethers.getContractFactory("SampleToken");
    const ymwk = await YMWK.deploy(initialSupply);
    await ymwk.deployed();

    const Distributor = await ethers.getContractFactory("Distributor");
    const distributor = await Distributor.deploy(factory.address, ymwk.address);
    await distributor.deployed();

    return { factory, feePool, distributor, ymwk, owner, addr1, addr2 };
  }

  async function deployFactoryAndTemplateFixture() {
    const { factory, feePool, distributor, ymwk, owner, addr1, addr2 } =
      await loadFixture(deployDistributorFixture);

    const Template = await ethers.getContractFactory("TemplateV1");
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

  describe("deploy", function () {
    it("constructor_success_1", async function () {
      await loadFixture(deployFactoryAndFeePoolFixture);
    });
  });

  describe("addTemplate", function () {
    it("addTemplate_success_1", async function () {
      await loadFixture(deployFactoryAndTemplateFixture);
    });

    it("addTemplate_fail_1", async function () {
      const { factory, template, addr1 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const templateName2 = ethers.utils.hexZeroPad(
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes("sale2")),
        32,
      );
      await expect(
        factory
          .connect(addr1)
          .addTemplate(
            templateName2,
            template.address,
            template.interface.getSighash("initialize"),
            template.interface.getSighash("initializeTransfer"),
          ),
      ).to.be.reverted;
    });

    it("addTemplate_fail_2", async function () {
      const { factory, template } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      await expect(
        factory.addTemplate(
          templateName,
          template.address,
          template.interface.getSighash("initialize"),
          template.interface.getSighash("initializeTransfer"),
        ),
      ).to.be.reverted;
    });
  });

  describe("removeTemplate", function () {
    it("removeTemplate_success_1", async function () {
      const { factory } = await loadFixture(deployFactoryAndTemplateFixture);
      await factory.removeTemplate(templateName);
      const templateInfo = await factory.templates(templateName);
      await expect(templateInfo[0]).to.equal(ethers.constants.AddressZero);
    });

    it("removeTemplate_success_2", async function () {
      const { factory, template, addr1 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const notRegisteredTemplateName =
        "0x11116c6554656d706c6174655631000000000000000000000000000000000000";
      await factory.removeTemplate(notRegisteredTemplateName);
      const templateInfo = await factory.templates(templateName);
      const notRegisteredtemplateInfo = await factory.templates(
        notRegisteredTemplateName,
      );
      await expect(templateInfo[0]).to.equal(template.address);
      await expect(notRegisteredtemplateInfo[0]).to.equal(
        ethers.constants.AddressZero,
      );
    });

    it("removeTemplate_fail_1", async function () {
      const { factory, template, addr1 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      await expect(factory.connect(addr1).removeTemplate(templateName)).to.be
        .reverted;
    });
  });

  describe("deployAuction", function () {
    it("deployAuction_success_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount = ethers.utils.parseEther("1");
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
          ethers.utils.parseEther("0.1"),
        ],
      );

      await expect(factory.deployAuction(templateName, args)).to.not.be
        .reverted;
    });

    // 登録されていないテンプレートでのセール立ち上げ
    it("deployAuction_fail_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount = ethers.utils.parseEther("1");
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
          ethers.utils.parseEther("0.1"),
        ],
      );

      const notRegisteredTemplateName =
        "0x11116c6554656d706c6174655631000000000000000000000000000000000000";
      await expect(
        factory.deployAuction(notRegisteredTemplateName, args),
      ).to.be.revertedWith("No such template in the list.");
    });
  });
});
