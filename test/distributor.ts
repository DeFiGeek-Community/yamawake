const { expect } = require("chai");
const { ethers } = require("hardhat");
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { sendEther, deploySaleTemplate, timeTravel } from "./scenarioHelper";

describe("Distributor", function () {
  const initialSupply = ethers.utils.parseEther("1000");
  const templateName = ethers.utils.formatBytes32String("TemplateV1");
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

  async function deployTokenFixture() {
    const Token = await ethers.getContractFactory("SampleToken");
    const token = await Token.deploy(initialSupply);
    await token.deployed();

    return { token };
  }

  describe("constructor", function () {
    // 正常な初期化
    it("constructor_success_1", async function () {
      const { factory, feePool, distributor, ymwk, owner, addr1, addr2 } =
        await loadFixture(deployDistributorFixture);

      expect(await distributor.factory()).to.be.equal(factory.address);

      expect(await distributor.token()).to.be.equal(ymwk.address);
    });
  });

  describe("addScore", function () {
    // 正常なスコアの追加
    it("addScore_success_1", async function () {
      const {
        factory,
        feePool,
        distributor,
        template,
        ymwk,
        owner,
        addr1,
        addr2,
      } = await loadFixture(deployFactoryAndTemplateFixture);

      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("100");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        "0",
      );

      await timeTravel(DAY);

      await sendEther(sale.address, "1", addr1);

      await timeTravel(DAY);

      await sale.connect(addr1).claim(addr1.address, addr1.address);

      expect(await distributor.scores(addr1.address)).to.be.equal(
        ethers.utils.parseEther("100"),
      );

      await sale.connect(owner).withdrawRaisedETH();

      expect(await distributor.scores(owner.address)).to.be.equal(
        ethers.utils.parseEther("100"),
      );
    });
  });

  describe("claim", function () {
    // 正常なクレーム
    it("claim_success_1", async function () {
      const {
        factory,
        feePool,
        distributor,
        template,
        ymwk,
        owner,
        addr1,
        addr2,
      } = await loadFixture(deployFactoryAndTemplateFixture);

      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("100");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        "0",
      );

      await timeTravel(DAY);

      await sendEther(sale.address, "1", addr1);

      await timeTravel(DAY);

      await sale.connect(addr1).claim(addr1.address, addr1.address);

      await ymwk.transfer(distributor.address, ethers.utils.parseEther("500"));

      await expect(
        await distributor.connect(addr1).claim(),
      ).to.changeTokenBalances(
        ymwk,
        [distributor, addr1],
        [ethers.utils.parseEther("-100"), ethers.utils.parseEther("100")],
      );

      await expect(await distributor.scores(addr1.address)).to.be.equal("0");
    });

    // スコアがないユーザのクレーム
    it("claim_fail_1", async function () {
      const {
        factory,
        feePool,
        distributor,
        template,
        ymwk,
        owner,
        addr1,
        addr2,
      } = await loadFixture(deployFactoryAndTemplateFixture);

      await ymwk.transfer(distributor.address, ethers.utils.parseEther("500"));

      await expect(distributor.connect(addr1).claim()).to.be.revertedWith(
        "Not eligible to get rewarded",
      );
    });

    // Distributorに十分なトークン残高がない場合のクレーム
    it("claim_success_2", async function () {
      const {
        factory,
        feePool,
        distributor,
        template,
        ymwk,
        owner,
        addr1,
        addr2,
      } = await loadFixture(deployFactoryAndTemplateFixture);

      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("100");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        "0",
      );

      await timeTravel(DAY);

      await sendEther(sale.address, "1", addr1);

      await timeTravel(DAY);

      await sale.connect(addr1).claim(addr1.address, addr1.address);

      await ymwk.transfer(distributor.address, ethers.utils.parseEther("50"));

      await expect(
        await distributor.connect(addr1).claim(),
      ).to.changeTokenBalances(
        ymwk,
        [distributor, addr1],
        [ethers.utils.parseEther("-50"), ethers.utils.parseEther("50")],
      );

      await expect(await distributor.scores(addr1.address)).to.be.equal("0");
    });

    // Distributorのトークン残高が0の場合のクレーム
    it("claim_fail_2", async function () {
      const {
        factory,
        feePool,
        distributor,
        template,
        ymwk,
        owner,
        addr1,
        addr2,
      } = await loadFixture(deployFactoryAndTemplateFixture);

      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("100");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        "0",
      );

      await timeTravel(DAY);

      await sendEther(sale.address, "1", addr1);

      await timeTravel(DAY);

      await sale.connect(addr1).claim(addr1.address, addr1.address);

      await expect(distributor.connect(addr1).claim()).to.be.revertedWith(
        "No reward available.",
      );
    });
  });
});
