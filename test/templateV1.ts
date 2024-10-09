const { expect } = require("chai");
const { ethers } = require("hardhat");
import {
  loadFixture,
  SnapshotRestorer,
  takeSnapshot,
  time,
} from "@nomicfoundation/hardhat-network-helpers";
import { sendEther, timeTravel, deploySaleTemplate } from "./scenarioHelper";

describe("TemplateV1", function () {
  let snapshot: SnapshotRestorer;
  before(async () => {
    snapshot = await takeSnapshot();
  });
  after(async () => {
    await snapshot.restore();
  });
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

  describe("initialize", function () {
    // Nullアドレスのトークンでのセール立ち上げ
    it("initialize_fail_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );

      const allocatedAmount = ethers.utils.parseEther("1");
      const now = await time.latest();

      const abiCoder = ethers.utils.defaultAbiCoder;
      const args = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [
          owner.address,
          now + DAY,
          DAY,
          ethers.constants.AddressZero,
          allocatedAmount,
          ethers.utils.parseEther("0.1"),
        ],
      );

      await expect(
        factory.deployAuction(templateName, args),
      ).to.be.revertedWith("Go with non null address.");
    });

    // Nullアドレスのオーナーでのセール立ち上げ
    it("initialize_fail_2", async function () {
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
          ethers.constants.AddressZero,
          now + DAY,
          DAY,
          token.address,
          allocatedAmount,
          ethers.utils.parseEther("0.1"),
        ],
      );

      await expect(
        factory.deployAuction(templateName, args),
      ).to.be.revertedWith("owner must be there");
    });

    // allocatedAmountの境界値
    it("initialize_success_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.BigNumber.from(10).pow(56);
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount1 = ethers.BigNumber.from(10).pow(50);
      const allocatedAmount2 = ethers.BigNumber.from(10).pow(6);
      await token.approve(factory.address, initialSupply);
      const now = await time.latest();

      const abiCoder = ethers.utils.defaultAbiCoder;
      const args1 = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [
          owner.address,
          now + DAY,
          DAY,
          token.address,
          allocatedAmount1,
          ethers.utils.parseEther("0.1"),
        ],
      );

      await expect(factory.deployAuction(templateName, args1)).to.not.be
        .reverted;

      const args2 = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [
          owner.address,
          now + DAY,
          DAY,
          token.address,
          allocatedAmount2,
          ethers.utils.parseEther("0.1"),
        ],
      );

      await expect(factory.deployAuction(templateName, args2)).to.not.be
        .reverted;
    });

    // allocatedAmountの境界値
    it("initialize_fail_3", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.BigNumber.from(10).pow(6).sub(1);
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
          ethers.utils.parseEther("0.1"),
        ],
      );

      await expect(
        factory.deployAuction(templateName, args),
      ).to.be.revertedWith(
        "allocatedAmount must be greater than or equal to 1e6.",
      );
    });

    // allocatedAmountの境界値
    it("initialize_fail_4", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.BigNumber.from(10).pow(50).add(1);
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
          ethers.utils.parseEther("0.1"),
        ],
      );

      await expect(
        factory.deployAuction(templateName, args),
      ).to.be.revertedWith(
        "allocatedAmount must be less than or equal to 1e50.",
      );
    });

    // startingAtの境界値
    it("initialize_success_2", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.BigNumber.from(10).pow(18);
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount = initialSupply;
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const abiCoder = ethers.utils.defaultAbiCoder;
      const args = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [owner.address, now + 1, DAY, token.address, allocatedAmount, "0"],
      );

      await expect(factory.deployAuction(templateName, args)).to.not.be
        .reverted;
    });

    // startingAtの境界値
    it("initialize_fail_5", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.BigNumber.from(10).pow(18);
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount = initialSupply;
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const abiCoder = ethers.utils.defaultAbiCoder;
      const args = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [owner.address, now - 1, DAY, token.address, allocatedAmount, "0"],
      );

      await expect(
        factory.deployAuction(templateName, args),
      ).to.be.revertedWith("startingAt must be in the future");
    });

    // eventDurationの境界値
    it("initialize_success_3", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.BigNumber.from(10).pow(18);
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount = initialSupply;
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const abiCoder = ethers.utils.defaultAbiCoder;
      const args = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [owner.address, now + DAY, DAY, token.address, allocatedAmount, "0"],
      );

      await expect(factory.deployAuction(templateName, args)).to.not.be
        .reverted;
    });

    // eventDurationの境界値
    it("initialize_fail_6", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.BigNumber.from(10).pow(18);
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
          DAY - 1,
          token.address,
          allocatedAmount,
          "0",
        ],
      );

      await expect(
        factory.deployAuction(templateName, args),
      ).to.be.revertedWith("event duration is too short");
    });

    // eventDurationの境界値
    it("initialize_fail_7", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.BigNumber.from(10).pow(18);
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
          DAY * 30 + 1,
          token.address,
          allocatedAmount,
          "0",
        ],
      );

      await expect(
        factory.deployAuction(templateName, args),
      ).to.be.revertedWith("event duration is too long");
    });

    // minRaisedAmountの境界値
    it("initialize_success_4", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.BigNumber.from(10).pow(50);
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount = ethers.BigNumber.from(10).pow(18);
      await token.approve(factory.address, initialSupply);
      const now = await time.latest();

      const minRaisedAmount1 = "0";
      const minRaisedAmount2 = ethers.BigNumber.from(10).pow(27);

      const abiCoder = ethers.utils.defaultAbiCoder;
      const args1 = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [
          owner.address,
          now + DAY,
          DAY,
          token.address,
          allocatedAmount,
          minRaisedAmount1,
        ],
      );
      const args2 = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [
          owner.address,
          now + DAY,
          DAY,
          token.address,
          allocatedAmount,
          minRaisedAmount2,
        ],
      );

      await expect(factory.deployAuction(templateName, args1)).to.not.be
        .reverted;
      await expect(factory.deployAuction(templateName, args2)).to.not.be
        .reverted;
    });

    // minRaisedAmountの境界値
    it("initialize_fail_8", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.utils.parseEther("1");
      const minRaisedAmount = ethers.BigNumber.from(10).pow(27).add(1);
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
        factory.deployAuction(templateName, args),
      ).to.be.revertedWith(
        "minRaisedAmount must be less than or equal to 1e27.",
      );
    });

    // factoryアドレス以外からのセール立ち上げ操作
    it("initialize_fail_9", async function () {
      const { factory, owner, template } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.utils.parseEther("1");
      const minRaisedAmount = ethers.BigNumber.from(10).pow(18);
      const token = await Token.deploy(initialSupply);
      await token.deployed();

      const allocatedAmount = initialSupply;
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      await expect(
        template.initialize(
          owner.address,
          now + DAY,
          DAY,
          token.address,
          allocatedAmount,
          minRaisedAmount,
        ),
      ).to.be.revertedWith("You are not the factory.");
    });

    // Creation feeを送付した場合のセール立ち上げ操作
    it("initialize_fail_10", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const Token = await ethers.getContractFactory("SampleToken");
      const initialSupply = ethers.utils.parseEther("1");
      const minRaisedAmount = ethers.BigNumber.from(10).pow(27);
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
      ).to.be.revertedWith("This contract does not accept the creation fee");
    });
  });

  describe("withdrawRaisedETH", function () {
    // 成功したセールの売上回収
    it("withdrawRaisedETH_success_1", async function () {
      const { factory, feePool, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
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
      await sendEther(sale.address, "100", owner);

      await timeTravel(DAY * 4);
      await expect(
        sale.connect(owner).withdrawRaisedETH(),
      ).to.changeEtherBalances(
        [owner.address, sale.address, feePool.address],
        [
          ethers.utils.parseEther("99"),
          ethers.utils.parseEther("-100"),
          ethers.utils.parseEther("1"),
        ],
      );
    });

    // セール期間中の売上回収
    it("withdrawRaisedETH_fail_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
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
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);
      await sendEther(sale.address, "100", owner);

      await expect(sale.connect(owner).withdrawRaisedETH()).to.be.revertedWith(
        "Withdrawal unavailable yet.",
      );
    });

    // 成功したセールのオーナーアドレス以外からの売上回収
    it("withdrawRaisedETH_success_2", async function () {
      const { factory, owner, feePool, addr1 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
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
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);
      await sendEther(sale.address, "100", owner);

      await timeTravel(DAY * 4);
      await expect(
        sale.connect(addr1).withdrawRaisedETH(),
      ).to.changeEtherBalances(
        [owner.address, sale.address, feePool.address, addr1.address],
        [
          ethers.utils.parseEther("99"),
          ethers.utils.parseEther("-100"),
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("0"),
        ],
      );
    });

    // 成功したセールの売上ロック期間中かつ最低入札額で割当1以上の場合の売上回収
    it("withdrawRaisedETH_success_3", async function () {
      const { factory, feePool, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = "10000000";
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("1"),
      );

      await timeTravel(DAY);
      const signers = await ethers.getSigners();
      const promiseList1 = [];
      for (let i = 0; i < 100; i++) {
        const signer = signers[i];
        promiseList1.push(sendEther(sale.address, "100", signer));
      }
      await Promise.all(promiseList1);

      await timeTravel(DAY);

      await expect(
        sale.connect(owner).withdrawRaisedETH(),
      ).to.changeEtherBalances(
        [owner.address, sale.address, feePool.address],
        [
          ethers.utils.parseEther("9900"),
          ethers.utils.parseEther("-10000"),
          ethers.utils.parseEther("100"),
        ],
      );
    });

    // 成功したセールの売上ロック期間中かつ最低入札額で割当0になる場合の売上回収
    it("withdrawRaisedETH_fail_3", async function () {
      const { factory, feePool, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = "9999999";
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("1"),
      );

      await timeTravel(DAY);
      const signers = await ethers.getSigners();
      const promiseList1 = [];
      for (let i = 0; i < 100; i++) {
        const signer = signers[i];
        promiseList1.push(sendEther(sale.address, "100", signer));
      }
      await Promise.all(promiseList1);

      await timeTravel(DAY);

      await expect(sale.connect(owner).withdrawRaisedETH()).to.be.revertedWith(
        "Refund candidates may exist. Withdrawal unavailable yet.",
      );

      await timeTravel(DAY * 3);

      await expect(
        sale.connect(owner).withdrawRaisedETH(),
      ).to.changeEtherBalances(
        [owner.address, sale.address, feePool.address],
        [
          ethers.utils.parseEther("9900"),
          ethers.utils.parseEther("-10000"),
          ethers.utils.parseEther("100"),
        ],
      );
    });

    // 失敗したセールの売上回収
    it("withdrawRaisedETH_fail_4", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("100"),
      );

      await timeTravel(DAY);
      await sendEther(sale.address, "99", owner);

      await timeTravel(DAY * 4);
      await expect(sale.connect(owner).withdrawRaisedETH()).to.be.revertedWith(
        "The required amount has not been raised!",
      );
    });

    // it("withdrawRaisedETH_subsuccess_1", async function () {
    //     const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
    //     const { token } = await loadFixture(deployTokenFixture);
    //     const allocatedAmount = "1000000"
    //     await token.approve(factory.address, allocatedAmount);
    //     const now = await time.latest();

    //     const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("1"));

    //     await timeTravel(DAY);
    //     const signers = await ethers.getSigners();
    //     const promiseList1 = [];

    //     for(let i=0; i<1000001; i++) {
    //         const signer = signers[i];
    //         promiseList1.push(sendEther(sale.address, "100", signer));
    //     }
    //     await Promise.all(promiseList1);

    //     await timeTravel(DAY);

    //     const promiseList2 = [];
    //     for(let i=0; i<101; i++) {
    //         const signer = signers[i];
    //         promiseList2.push(sale.connect(signer).claim(signer.address, signer.address));
    //     }
    //     await Promise.all(promiseList2);

    //     await timeTravel(DAY*3);
    //     await expect(sale.connect(owner).withdrawRaisedETH()).to.changeEtherBalance(owner.address, "0");
    // });
  });

  describe("withdrawERC20Onsale", function () {
    // 失敗したセールのトークン回収
    it("withdrawERC20Onsale_success_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("100"),
      );

      await timeTravel(DAY);
      await sendEther(sale.address, "99", owner);

      await timeTravel(DAY * 4);
      await expect(
        sale.connect(owner).withdrawERC20Onsale(),
      ).to.changeTokenBalances(
        token,
        [owner.address, sale.address],
        [ethers.utils.parseEther("1"), ethers.utils.parseEther("-1")],
      );
    });

    // 失敗したセールのオーナー以外からのトークン回収
    it("withdrawERC20Onsale_success_2", async function () {
      const { factory, owner, addr1 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("100"),
      );

      await timeTravel(DAY);
      await sendEther(sale.address, "99", owner);

      await timeTravel(DAY * 4);
      await expect(
        sale.connect(addr1).withdrawERC20Onsale(),
      ).to.changeTokenBalances(
        token,
        [owner.address, sale.address, addr1.address],
        [
          ethers.utils.parseEther("1"),
          ethers.utils.parseEther("-1"),
          ethers.utils.parseEther("0"),
        ],
      );
    });

    // 成功したセールのトークン回収
    it("withdrawERC20Onsale_fail_2", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
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
      await sendEther(sale.address, "100", owner);

      await timeTravel(DAY * 4);
      await expect(
        sale.connect(owner).withdrawERC20Onsale(),
      ).to.be.revertedWith("The required amount has been raised!");
    });

    // 成功したが売上0のセールのトークン回収
    it("withdrawERC20Onsale_success_3", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("1");
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

      await timeTravel(DAY * 4);
      await expect(
        sale.connect(owner).withdrawERC20Onsale(),
      ).to.changeTokenBalances(
        token,
        [owner.address, sale.address],
        [ethers.utils.parseEther("1"), ethers.utils.parseEther("-1")],
      );
    });
  });

  describe("receive", function () {
    // 正常な入札
    it("receive_success_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, ethers.utils.parseEther("10"));
      const sendingAmounts = ["0.001", "0.01", "0.1", "1"];

      for (const amount of sendingAmounts) {
        const now = await time.latest();
        const sale = await deploySaleTemplate(
          factory,
          token.address,
          owner.address,
          allocatedAmount,
          now + DAY,
          DAY,
          ethers.utils.parseEther("0.1"),
        );

        await timeTravel(DAY);
        await sendEther(sale.address, amount, owner);

        await expect(await sale.totalRaised()).to.be.eq(
          ethers.utils.parseEther(amount),
        );
        await expect(await sale.raised(owner.address)).to.be.eq(
          ethers.utils.parseEther(amount),
        );
      }
    });

    // 最低入札金額以下の入札
    it("receive_fail_1", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);

      await expect(sendEther(sale.address, "0.0009", owner)).to.be.revertedWith(
        "The amount must be greater than or equal to 0.001ETH",
      );
    });

    // 開催前のセールへの入札
    it("receive_fail_2", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await expect(sendEther(sale.address, "1", owner)).to.be.revertedWith(
        "The offering has not started yet",
      );
    });

    // 終了後のセールへの入札
    it("receive_fail_3", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY * 3);

      await expect(sendEther(sale.address, "1", owner)).to.be.revertedWith(
        "The offering has already ended",
      );
    });

    it("receive_success_2", async function () {
      const { factory, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );
      await timeTravel(DAY);

      const signers = await ethers.getSigners();
      const promiseList1 = [];

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        promiseList1.push(sendEther(sale.address, amount, signer));
      }
      await Promise.all(promiseList1);

      await timeTravel(DAY);

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);

        await expect(await sale.raised(signer.address)).to.be.eq(
          ethers.utils.parseEther(amount),
        );
      }
      await expect(await sale.totalRaised()).to.be.eq(
        ethers.utils.parseEther("55"),
      );
    });
  });

  describe("claim", function () {
    // 成功したセールで自分自身への割当トークン請求
    it("claim_success_1", async function () {
      const { factory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);

      const signers = await ethers.getSigners();
      const promiseList1 = [];

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        promiseList1.push(sendEther(sale.address, amount, signer));
      }
      await Promise.all(promiseList1);

      await timeTravel(DAY);

      let totalClaimed = 0n;
      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        await sale.connect(signer).claim(signer.address, signer.address);
        const balance = await token.balanceOf(signer.address);
        const expectedBalance = BigInt(Number(amount) * 10 ** 18) / BigInt(55);

        totalClaimed = totalClaimed + BigInt(balance);

        await expect(balance.toString()).to.be.eq(expectedBalance.toString());
      }

      const contractTokenBalance = await token.balanceOf(sale.address);
      await expect(contractTokenBalance.toString()).to.eq("50");

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        await expect(
          sale.connect(signer).claim(signer.address, signer.address),
        ).to.be.revertedWith("You don't have any contribution.");
      }
    });

    // 成功したセールで自分以外への割当トークン請求
    it("claim_success_2", async function () {
      const { factory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);

      const signers = await ethers.getSigners();
      const promiseList1 = [];

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        promiseList1.push(sendEther(sale.address, amount, signer));
      }
      await Promise.all(promiseList1);

      await timeTravel(DAY);

      await sale
        .connect(signers[1])
        .claim(signers[1].address, signers[2].address);
      const user1TokenBalance = await token.balanceOf(signers[1].address);
      const user2TokenBalance = await token.balanceOf(signers[2].address);

      await expect(user1TokenBalance.toString()).to.eq("0");
      await expect(user2TokenBalance.toString()).to.eq("1818181818181818");
      await expect(
        sale.connect(signers[1]).claim(signers[1].address, signers[2].address),
      ).to.be.revertedWith("You don't have any contribution.");
    });

    // 成功したセールで非参加者から参加者への割当トークン請求
    it("claim_success_3", async function () {
      const { factory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);

      const signers = await ethers.getSigners();
      const promiseList1 = [];

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        promiseList1.push(sendEther(sale.address, amount, signer));
      }
      await Promise.all(promiseList1);

      await timeTravel(DAY);

      await sale
        .connect(signers[101])
        .claim(signers[1].address, signers[1].address);
      const user1TokenBalance = await token.balanceOf(signers[101].address);
      const user2TokenBalance = await token.balanceOf(signers[1].address);

      await expect(user1TokenBalance.toString()).to.eq("0");
      await expect(user2TokenBalance.toString()).to.eq("1818181818181818");
      await expect(
        sale
          .connect(signers[101])
          .claim(signers[1].address, signers[1].address),
      ).to.be.revertedWith("You don't have any contribution.");
    });

    // 成功したセールで非参加者から非参加者への割当トークン請求
    it("claim_fail_1", async function () {
      const { factory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);

      const signers = await ethers.getSigners();
      const promiseList1 = [];

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        promiseList1.push(sendEther(sale.address, amount, signer));
      }
      await Promise.all(promiseList1);

      await timeTravel(DAY);

      await expect(
        sale.connect(signers[0]).claim(signers[0].address, signers[0].address),
      ).to.be.revertedWith("You don't have any contribution.");
    });

    // 成功したセールで非参加者から非参加者への割当トークン請求
    it("claim_fail_2", async function () {
      const { factory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);

      const signers = await ethers.getSigners();
      const promiseList1 = [];

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        promiseList1.push(sendEther(sale.address, amount, signer));
      }
      await Promise.all(promiseList1);

      await timeTravel(DAY);

      await expect(
        sale.connect(signers[0]).claim(signers[1].address, signers[0].address),
      ).to.be.revertedWith("participant or recipient invalid");
    });

    // セール終了前の請求
    it("claim_fail_3", async function () {
      const { factory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);

      const signers = await ethers.getSigners();
      const promiseList1 = [];

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        promiseList1.push(sendEther(sale.address, amount, signer));
      }
      await Promise.all(promiseList1);

      await expect(
        sale.connect(signers[1]).claim(signers[1].address, signers[1].address),
      ).to.be.revertedWith("Early to claim. Sale is not finished.");
    });

    // 成功したセールで割当がない場合の返金
    it("claim_success_4", async function () {
      const { factory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = 1000000;
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );

      await timeTravel(DAY);

      const signers = await ethers.getSigners();
      const promiseList1 = [];

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        promiseList1.push(sendEther(sale.address, "1000", signer));
      }
      await Promise.all(promiseList1);
      await sendEther(sale.address, "0.001", owner);

      await timeTravel(DAY);

      await expect(
        sale.connect(owner).claim(owner.address, owner.address),
      ).to.changeEtherBalance(
        owner,
        ethers.utils.parseEther("0.001").toString(),
      );
      await expect(
        sale.connect(owner).claim(owner.address, owner.address),
      ).to.be.revertedWith("You don't have any contribution.");
    });

    // 失敗したセールでの返金
    it("claim_success_5", async function () {
      const { factory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);

      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("1000000000"),
      );

      await timeTravel(DAY);

      const signers = await ethers.getSigners();
      const promiseList1 = [];

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        promiseList1.push(sendEther(sale.address, amount, signer));
      }
      await Promise.all(promiseList1);

      await timeTravel(DAY);

      for (let i = 1; i < 101; i++) {
        const signer = signers[i];
        const amount = Number(Math.ceil(i / 10) / 10).toFixed(1);
        await expect(
          sale.connect(signer).claim(signer.address, signer.address),
        ).to.changeEtherBalance(
          signer,
          ethers.utils.parseEther(amount).toString(),
        );
        await expect(
          sale.connect(signer).claim(signer.address, signer.address),
        ).to.be.revertedWith("You don't have any contribution.");
      }
    });
  });

  describe("initializeTransfer", function () {
    it("call_externaly_fail_not_factory", async function () {
      const { factory, template, owner } = await loadFixture(
        deployFactoryAndTemplateFixture,
      );
      const { token } = await loadFixture(deployTokenFixture);
      const allocatedAmount = ethers.utils.parseEther("1");
      await token.approve(factory.address, allocatedAmount);
      const now = await time.latest();

      // initializeTransfer for instance
      const sale = await deploySaleTemplate(
        factory,
        token.address,
        owner.address,
        allocatedAmount,
        now + DAY,
        DAY,
        ethers.utils.parseEther("0.1"),
      );
      await token.approve(sale.address, allocatedAmount);
      await expect(
        sale
          .connect(owner)
          .initializeTransfer(token.address, allocatedAmount, sale.address),
      ).to.be.revertedWith("You are not the factory.");

      // initializeTransfer for template
      await token.approve(template.address, allocatedAmount);
      await expect(
        template
          .connect(owner)
          .initializeTransfer(token.address, allocatedAmount, sale.address),
      ).to.be.revertedWith("You are not the factory.");
    });
  });
});
