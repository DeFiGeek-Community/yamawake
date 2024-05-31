import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { getTemplateAddr } from "./scenarioHelper";
import { TemplateYMWKWithdraw } from "../typechain-types";

describe("TemplateYMWKWithdraw", function () {
  const templateName = ethers.encodeBytes32String("TemplateYMWKWithdraw");

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

  async function deployDistributorFixture() {
    const { factory, feePool, owner, addr1, addr2 } = await loadFixture(
      deployFactoryAndFeePoolFixture
    );
    const YMWK = await ethers.getContractFactory("YMWK");
    const ymwk = await YMWK.deploy();
    await ymwk.waitForDeployment();

    const Distributor = await ethers.getContractFactory("Distributor");
    const distributor = await Distributor.deploy(
      await factory.getAddress(),
      await ymwk.getAddress()
    );
    await distributor.waitForDeployment();

    return { factory, feePool, distributor, ymwk, owner, addr1, addr2 };
  }

  async function deployFactoryAndTemplateFixture() {
    const { factory, feePool, distributor, ymwk, owner, addr1, addr2 } =
      await loadFixture(deployDistributorFixture);

    const Template = await ethers.getContractFactory("TemplateYMWKWithdraw");
    const template = await Template.deploy(
      await factory.getAddress(),
      await feePool.getAddress(),
      await distributor.getAddress()
    );
    await template.waitForDeployment();

    await factory.addTemplate(
      templateName,
      await template.getAddress(),
      Template.interface.getFunction("initialize")!.selector,
      ethers.zeroPadValue("0x", 4)
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

  async function deployTemplate(factory: any) {
    const arg = ethers.ZeroHash;
    const tx = await factory.deployAuction(templateName, arg);
    const receipt = await tx.wait();
    const templateAddr = await getTemplateAddr(receipt);
    const Sale = await ethers.getContractFactory("TemplateYMWKWithdraw");
    return Sale.attach(templateAddr) as TemplateYMWKWithdraw;
  }

  describe("initialize", function () {
    it("initialize_success_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture
      );

      const arg = ethers.ZeroHash;
      await expect(factory.deployAuction(templateName, arg)).to.not.be.reverted;
    });

    // factoryアドレス以外からのセール立ち上げ操作
    it("initialize_fail_1", async function () {
      const { factory, owner, template } = await loadFixture(
        deployFactoryAndTemplateFixture
      );

      await expect(template.initialize()).to.be.revertedWith(
        "You are not the factory."
      );
    });
  });

  describe("addScore", function () {
    it("success by owner", async function () {
      const { factory, distributor, owner } = await loadFixture(
        deployFactoryAndTemplateFixture
      );
      const instance = await deployTemplate(factory);
      const score = ethers.parseEther("10");
      expect(await distributor.scores(owner.address)).to.be.equal(0);

      instance.addScore(score);

      expect(await distributor.scores(owner.address)).to.be.equal(score);
    });

    it("fail by not owner", async function () {
      const { factory, distributor, addr1 } = await loadFixture(
        deployFactoryAndTemplateFixture
      );
      const instance = await deployTemplate(factory);
      const score = ethers.parseEther("10");
      expect(await distributor.scores(addr1.address)).to.be.equal(0);

      await expect(instance.connect(addr1).addScore(score)).to.be.reverted;
    });
  });
});
