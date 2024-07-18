import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { sendEther, deploySaleTemplate, timeTravel } from "./scenarioHelper";

describe("Distributor", function () {
  const initialSupply = ethers.parseEther("1000");
  const templateName = ethers.encodeBytes32String("TemplateV1");
  const DAY = 24 * 60 * 60;

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
    const distributor = await Distributor.deploy(factory.target, ymwk.target);
    await distributor.waitForDeployment();

    return { factory, feePool, distributor, ymwk, owner, addr1, addr2 };
  }

  async function deployFactoryAndTemplateFixture() {
    const { factory, feePool, distributor, ymwk, owner, addr1, addr2 } =
      await loadFixture(deployDistributorFixture);

    const Template = await ethers.getContractFactory("TemplateV1");
    const template = await Template.deploy(
      factory.target,
      feePool.target,
      distributor.target
    );
    await template.waitForDeployment();

    await factory.addTemplate(
      templateName,
      template.target,
      Template.interface.getFunction("initialize")!.selector,
      Template.interface.getFunction("initializeTransfer")!.selector
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
    await token.waitForDeployment();

    return { token };
  }

  describe("constructor", function () {
    // 正常な初期化
    it("constructor_success_1", async function () {
      const { factory, feePool, distributor, ymwk, owner, addr1, addr2 } =
        await loadFixture(deployDistributorFixture);

      expect(await distributor.factory()).to.be.equal(factory.target);

      expect(await distributor.token()).to.be.equal(ymwk.target);
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
      const allocatedAmount = ethers.parseEther("100");
      await token.approve(factory.target, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        await token.getAddress(),
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        "0"
      );

      await timeTravel(DAY);

      await sendEther(sale.target, "1", addr1);

      await timeTravel(DAY);

      await sale.connect(addr1).claim(addr1.address, addr1.address);

      expect(await distributor.scores(addr1.address)).to.be.equal(
        ethers.parseEther("100")
      );

      await sale.connect(owner).withdrawRaisedETH();

      expect(await distributor.scores(owner.address)).to.be.equal(
        ethers.parseEther("100")
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
      const allocatedAmount = ethers.parseEther("100");
      await token.approve(factory.target, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        await token.getAddress(),
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        "0"
      );

      await timeTravel(DAY);

      await sendEther(sale.target, "1", addr1);

      await timeTravel(DAY);

      await sale.connect(addr1).claim(addr1.address, addr1.address);

      await ymwk.transfer(distributor.target, ethers.parseEther("500"));

      await expect(
        await distributor.connect(addr1).claim(addr1.address)
      ).to.changeTokenBalances(
        ymwk,
        [distributor, addr1],
        [ethers.parseEther("-100"), ethers.parseEther("100")]
      );

      expect(await distributor.scores(addr1.address)).to.be.equal("0");
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

      await ymwk.transfer(distributor.target, ethers.parseEther("500"));

      await expect(
        distributor.connect(addr1).claim(addr1.address)
      ).to.be.revertedWith("Not eligible to get rewarded");
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
      const allocatedAmount = ethers.parseEther("100");
      await token.approve(factory.target, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        await token.getAddress(),
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        "0"
      );

      await timeTravel(DAY);

      await sendEther(sale.target, "1", addr1);

      await timeTravel(DAY);

      await sale.connect(addr1).claim(addr1.address, addr1.address);

      await ymwk.transfer(distributor.target, ethers.parseEther("50"));

      await expect(
        await distributor.connect(addr1).claim(addr1.address)
      ).to.changeTokenBalances(
        ymwk,
        [distributor, addr1],
        [ethers.parseEther("-50"), ethers.parseEther("50")]
      );

      expect(await distributor.scores(addr1.address)).to.be.equal("0");
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
      const allocatedAmount = ethers.parseEther("100");
      await token.approve(factory.target, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        await token.getAddress(),
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        "0"
      );

      await timeTravel(DAY);

      await sendEther(sale.target, "1", addr1);

      await timeTravel(DAY);

      await sale.connect(addr1).claim(addr1.address, addr1.address);

      await expect(
        distributor.connect(addr1).claim(addr1.address)
      ).to.be.revertedWith("No reward available.");
    });

    // 別アドレス宛のクレーム
    it("claim_success_3", async function () {
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
      const allocatedAmount = ethers.parseEther("100");
      await token.approve(factory.target, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        await token.getAddress(),
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        "0"
      );

      await timeTravel(DAY);

      await sendEther(sale.target, "1", addr1);

      await timeTravel(DAY);

      await sale.connect(addr1).claim(addr1.address, addr1.address);

      await ymwk.transfer(distributor.target, ethers.parseEther("50"));

      await expect(
        await distributor.connect(addr2).claim(addr1.address)
      ).to.changeTokenBalances(
        ymwk,
        [distributor, addr1, addr2],
        [
          ethers.parseEther("-50"),
          ethers.parseEther("50"),
          ethers.parseEther("0"),
        ]
      );

      expect(await distributor.scores(addr1.address)).to.be.equal("0");
    });
  });
});
