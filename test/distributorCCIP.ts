import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  sendEther,
  deploySaleTemplate,
  deployCCIPRouter,
  timeTravel,
} from "./scenarioHelper";

describe("DistributorCCIP", function () {
  const initialSupply = ethers.parseEther("1000");
  const templateNameSender = ethers.encodeBytes32String("TemplateV1Sener");
  const templateNameReceiver = ethers.encodeBytes32String("TemplateV1Receiver");
  const DAY = 24 * 60 * 60;
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

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
      deployFactoryAndFeePoolFixture,
    );
    const YMWK = await ethers.getContractFactory("YMWK");
    const ymwk = await YMWK.deploy();
    await ymwk.waitForDeployment();

    const {
      chainSelector,
      sourceRouter,
      destinationRouter,
      wrappedNative,
      linkToken,
    } = await deployCCIPRouter(owner.address);

    const DistributorSender =
      await ethers.getContractFactory("DistributorSender");
    const distributorSender = await DistributorSender.deploy(
      factory.target,
      sourceRouter,
    );
    await distributorSender.waitForDeployment();

    const DistributorReceiver = await ethers.getContractFactory(
      "DistributorReceiver",
    );
    const distributorReceiver = await DistributorReceiver.deploy(
      factory.target,
      ymwk.target,
      destinationRouter,
    );
    await distributorReceiver.waitForDeployment();

    return {
      factory,
      feePool,
      chainSelector,
      distributorSender,
      distributorReceiver,
      wrappedNative,
      linkToken,
      ymwk,
      owner,
      addr1,
      addr2,
    };
  }

  async function deployFactoryAndTemplateFixture() {
    const {
      factory,
      feePool,
      chainSelector,
      distributorSender,
      distributorReceiver,
      wrappedNative,
      linkToken,
      ymwk,
      owner,
      addr1,
      addr2,
    } = await loadFixture(deployDistributorFixture);

    const Template = await ethers.getContractFactory("TemplateV1");
    const templateSender = await Template.deploy(
      factory.target,
      feePool.target,
      distributorSender.target,
    );
    await templateSender.waitForDeployment();

    await factory.addTemplate(
      templateNameSender,
      templateSender.target,
      Template.interface.getFunction("initialize")!.selector,
      Template.interface.getFunction("initializeTransfer")!.selector,
    );

    const templateReceiver = await Template.deploy(
      factory.target,
      feePool.target,
      distributorReceiver.target,
    );
    await templateReceiver.waitForDeployment();

    await factory.addTemplate(
      templateNameReceiver,
      templateReceiver.target,
      Template.interface.getFunction("initialize")!.selector,
      Template.interface.getFunction("initializeTransfer")!.selector,
    );

    return {
      factory,
      feePool,
      chainSelector,
      distributorSender,
      distributorReceiver,
      wrappedNative,
      linkToken,
      ymwk,
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

  describe("Sender", function () {
    describe("constructor", function () {
      // 正常な初期化
      it("constructor_success_1", async function () {
        const { factory, distributorSender } = await loadFixture(
          deployDistributorFixture,
        );

        expect(await distributorSender.factory()).to.be.equal(factory.target);
      });

      // 権限のない初期化
      it("constructor_fail_1", async function () {
        const { chainSelector, distributorSender, distributorReceiver, addr1 } =
          await loadFixture(deployDistributorFixture);

        await expect(
          distributorSender
            .connect(addr1)
            .setAllowlistDestinationChainSender(
              chainSelector,
              distributorReceiver.target,
              true,
            ),
        ).to.be.reverted;
      });
    });

    describe("addScore", function () {
      // 正常なスコアの追加
      it("addScore_success_1", async function () {
        const { factory, distributorSender, owner, addr1 } = await loadFixture(
          deployFactoryAndTemplateFixture,
        );

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
          "0",
          undefined,
          templateNameSender,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        expect(await distributorSender.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );

        await sale.connect(owner).withdrawRaisedETH();

        expect(await distributorSender.scores(owner.address)).to.be.equal(
          ethers.parseEther("100"),
        );
      });
    });

    describe("claim", function () {
      // 正常なクレーム（ネイティブ）
      it("claim_success_1", async function () {
        const {
          factory,
          chainSelector,
          distributorSender,
          distributorReceiver,
          linkToken,
          owner,
          addr1,
        } = await loadFixture(deployFactoryAndTemplateFixture);

        await distributorSender.setAllowlistDestinationChainSender(
          chainSelector,
          distributorReceiver.target,
          true,
        );
        await distributorReceiver.setAllowlistSourceChainSender(
          chainSelector,
          distributorSender.target,
          true,
        );

        linkToken.transfer(addr1.address, ethers.parseEther("0.1"));

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
          "0",
          undefined,
          templateNameSender,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        const message = {
          receiver: abiCoder.encode(["bytes"], [distributorReceiver.target]),
          data: abiCoder.encode(
            ["address", "uint256", "bool"],
            [addr1.address, ethers.parseEther("100"), false],
          ),
          tokenAmounts: [],
          extraArgs: "0x",
          feeToken: ethers.ZeroAddress,
        };

        const router = await ethers.getContractAt(
          "IRouterClient",
          await distributorSender.router(),
        );
        const feeAmount = await router.getFee(chainSelector, message);

        expect(await distributorSender.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          "0",
        );

        await expect(
          distributorSender
            .connect(addr1)
            .sendScorePayNative(
              chainSelector,
              distributorReceiver.target,
              addr1.address,
              false,
              { value: feeAmount },
            ),
        ).to.not.be.reverted;

        expect(await distributorSender.scores(addr1.address)).to.be.equal("0");
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
      });

      // 正常なクレーム（ERC20）
      it("claim_success_2", async function () {
        const {
          factory,
          chainSelector,
          distributorSender,
          distributorReceiver,
          linkToken,
          owner,
          addr1,
        } = await loadFixture(deployFactoryAndTemplateFixture);

        await distributorSender.setAllowlistDestinationChainSender(
          chainSelector,
          distributorReceiver.target,
          true,
        );
        await distributorReceiver.setAllowlistSourceChainSender(
          chainSelector,
          distributorSender.target,
          true,
        );

        linkToken.transfer(addr1.address, ethers.parseEther("0.1"));

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
          "0",
          undefined,
          templateNameSender,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        const message = {
          receiver: abiCoder.encode(["bytes"], [distributorReceiver.target]),
          data: abiCoder.encode(
            ["address", "uint256", "bool"],
            [addr1.address, ethers.parseEther("100"), false],
          ),
          tokenAmounts: [],
          extraArgs: "0x",
          feeToken: linkToken.target,
        };

        const router = await ethers.getContractAt(
          "IRouterClient",
          await distributorSender.router(),
        );
        const feeAmount = await router.getFee(chainSelector, message);

        await linkToken
          .connect(addr1)
          .approve(distributorSender.target, feeAmount);

        expect(await distributorSender.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          "0",
        );

        await expect(
          distributorSender
            .connect(addr1)
            .sendScorePayToken(
              chainSelector,
              distributorReceiver.target,
              addr1.address,
              false,
              linkToken,
            ),
        ).to.not.be.reverted;

        expect(await distributorSender.scores(addr1.address)).to.be.equal("0");
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
      });

      // 正常なクレーム（L1でのクレーム）
      it("claim_success_3", async function () {
        const {
          factory,
          chainSelector,
          distributorSender,
          distributorReceiver,
          linkToken,
          ymwk,
          owner,
          addr1,
        } = await loadFixture(deployFactoryAndTemplateFixture);

        await distributorSender.setAllowlistDestinationChainSender(
          chainSelector,
          distributorReceiver.target,
          true,
        );
        await distributorReceiver.setAllowlistSourceChainSender(
          chainSelector,
          distributorSender.target,
          true,
        );

        linkToken.transfer(addr1.address, ethers.parseEther("0.1"));

        ymwk.transfer(distributorReceiver.target, ethers.parseEther("1000"));

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
          "0",
          undefined,
          templateNameSender,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        const message = {
          receiver: abiCoder.encode(["bytes"], [distributorReceiver.target]),
          data: abiCoder.encode(
            ["address", "uint256", "bool"],
            [addr1.address, ethers.parseEther("100"), true],
          ),
          tokenAmounts: [],
          extraArgs: "0x",
          feeToken: ethers.ZeroAddress,
        };

        const router = await ethers.getContractAt(
          "IRouterClient",
          await distributorSender.router(),
        );
        const feeAmount = await router.getFee(chainSelector, message);

        expect(await distributorSender.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          "0",
        );
        expect(await ymwk.balanceOf(addr1.address)).to.be.equal("0");

        await expect(
          distributorSender
            .connect(addr1)
            .sendScorePayNative(
              chainSelector,
              distributorReceiver.target,
              addr1.address,
              true,
              { value: feeAmount },
            ),
        ).to.not.be.reverted;

        expect(await distributorSender.scores(addr1.address)).to.be.equal("0");
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          ethers.parseEther("0"),
        );
        expect(await ymwk.balanceOf(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
      });

      // 別アドレス宛のクレーム
      it("claim_success_4", async function () {
        const {
          factory,
          chainSelector,
          distributorSender,
          distributorReceiver,
          ymwk,
          owner,
          addr1,
        } = await loadFixture(deployFactoryAndTemplateFixture);

        await distributorSender.setAllowlistDestinationChainSender(
          chainSelector,
          distributorReceiver.target,
          true,
        );
        await distributorReceiver.setAllowlistSourceChainSender(
          chainSelector,
          distributorSender.target,
          true,
        );

        ymwk.transfer(distributorReceiver.target, ethers.parseEther("1000"));

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
          "0",
          undefined,
          templateNameSender,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        const message = {
          receiver: abiCoder.encode(["bytes"], [distributorReceiver.target]),
          data: abiCoder.encode(
            ["address", "uint256", "bool"],
            [addr1.address, ethers.parseEther("100"), true],
          ),
          tokenAmounts: [],
          extraArgs: "0x",
          feeToken: ethers.ZeroAddress,
        };

        const router = await ethers.getContractAt(
          "IRouterClient",
          await distributorSender.router(),
        );
        const feeAmount = await router.getFee(chainSelector, message);

        expect(await distributorSender.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          "0",
        );
        expect(await ymwk.balanceOf(addr1.address)).to.be.equal("0");

        await expect(
          distributorSender.sendScorePayNative(
            chainSelector,
            distributorReceiver.target,
            addr1.address,
            true,
            { value: feeAmount },
          ),
        ).to.not.be.reverted;

        expect(await distributorSender.scores(addr1.address)).to.be.equal("0");
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          ethers.parseEther("0"),
        );
        expect(await ymwk.balanceOf(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
      });

      // sender,receiverの設定不足エラー
      it("claim_fail_1", async function () {
        const {
          factory,
          chainSelector,
          distributorSender,
          distributorReceiver,
          owner,
          addr1,
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
          "0",
          undefined,
          templateNameSender,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        const message = {
          receiver: abiCoder.encode(["bytes"], [distributorReceiver.target]),
          data: abiCoder.encode(
            ["address", "uint256", "bool"],
            [addr1.address, ethers.parseEther("100"), false],
          ),
          tokenAmounts: [],
          extraArgs: "0x",
          feeToken: ethers.ZeroAddress,
        };

        const router = await ethers.getContractAt(
          "IRouterClient",
          await distributorSender.router(),
        );
        const feeAmount = await router.getFee(chainSelector, message);

        expect(await distributorSender.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          "0",
        );

        await expect(
          distributorSender.sendScorePayNative(
            chainSelector,
            distributorReceiver.target,
            addr1.address,
            false,
            { value: feeAmount },
          ),
        ).to.be.reverted;
      });

      // スコアがないユーザのクレーム
      it("claim_fail_2", async function () {
        const {
          factory,
          chainSelector,
          distributorSender,
          distributorReceiver,
          addr1,
        } = await loadFixture(deployFactoryAndTemplateFixture);

        await distributorSender.setAllowlistDestinationChainSender(
          chainSelector,
          distributorReceiver.target,
          true,
        );
        await distributorReceiver.setAllowlistSourceChainSender(
          chainSelector,
          distributorSender.target,
          true,
        );

        const message = {
          receiver: abiCoder.encode(["bytes"], [distributorReceiver.target]),
          data: abiCoder.encode(
            ["address", "uint256", "bool"],
            [addr1.address, ethers.parseEther("100"), false],
          ),
          tokenAmounts: [],
          extraArgs: "0x",
          feeToken: ethers.ZeroAddress,
        };

        const router = await ethers.getContractAt(
          "IRouterClient",
          await distributorSender.router(),
        );
        const feeAmount = await router.getFee(chainSelector, message);

        expect(await distributorSender.scores(addr1.address)).to.be.equal(
          ethers.parseEther("0"),
        );
        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          "0",
        );

        await expect(
          distributorSender.sendScorePayNative(
            chainSelector,
            distributorReceiver.target,
            addr1.address,
            false,
            { value: feeAmount },
          ),
        ).to.be.revertedWith("Not eligible to get rewarded");
      });
    });
  });

  describe("Receiver", function () {
    describe("constructor", function () {
      // 正常な初期化
      it("constructor_success_1", async function () {
        const {
          factory,
          feePool,
          chainSelector,
          distributorSender,
          distributorReceiver,
          ymwk,
          owner,
          addr1,
          addr2,
        } = await loadFixture(deployDistributorFixture);

        expect(await distributorReceiver.factory()).to.be.equal(factory.target);

        expect(await distributorReceiver.token()).to.be.equal(ymwk.target);
      });

      // 権限のない初期化
      it("constructor_fail_1", async function () {
        const { chainSelector, distributorSender, distributorReceiver, addr1 } =
          await loadFixture(deployDistributorFixture);

        await expect(
          distributorReceiver
            .connect(addr1)
            .setAllowlistSourceChainSender(
              chainSelector,
              distributorSender.target,
              true,
            ),
        ).to.be.reverted;
      });
    });

    describe("addScore", function () {
      // 正常なスコアの追加
      it("addScore_success_1", async function () {
        const { factory, distributorReceiver, owner, addr1 } =
          await loadFixture(deployFactoryAndTemplateFixture);

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
          "0",
          undefined,
          templateNameReceiver,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );

        await sale.connect(owner).withdrawRaisedETH();

        expect(await distributorReceiver.scores(owner.address)).to.be.equal(
          ethers.parseEther("100"),
        );
      });
    });

    describe("rescueScore", function () {
      // 正常なスコアの追加
      it("rescueScore_success_1", async function () {
        const { distributorReceiver, addr1 } = await loadFixture(
          deployFactoryAndTemplateFixture,
        );

        await distributorReceiver.rescueScore(
          addr1.address,
          ethers.parseEther("100"),
        );

        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          ethers.parseEther("100"),
        );
      });

      // 権限がないスコアの追加
      it("rescueScore_fail_1", async function () {
        const { distributorReceiver, addr1 } = await loadFixture(
          deployFactoryAndTemplateFixture,
        );

        await expect(
          distributorReceiver
            .connect(addr1)
            .rescueScore(addr1.address, ethers.parseEther("100")),
        ).to.be.reverted;
      });
    });

    describe("claim", function () {
      // 正常なクレーム
      it("claim_success_1", async function () {
        const { factory, distributorReceiver, ymwk, owner, addr1 } =
          await loadFixture(deployFactoryAndTemplateFixture);

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
          "0",
          undefined,
          templateNameReceiver,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        await ymwk.transfer(
          distributorReceiver.target,
          ethers.parseEther("500"),
        );

        await expect(
          distributorReceiver.connect(addr1).claim(addr1.address),
        ).to.changeTokenBalances(
          ymwk,
          [distributorReceiver, addr1],
          [ethers.parseEther("-100"), ethers.parseEther("100")],
        );

        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          "0",
        );
      });

      // スコアがないユーザのクレーム
      it("claim_fail_1", async function () {
        const { distributorReceiver, ymwk, addr1 } = await loadFixture(
          deployFactoryAndTemplateFixture,
        );

        await ymwk.transfer(
          distributorReceiver.target,
          ethers.parseEther("500"),
        );

        await expect(distributorReceiver.connect(addr1).claim(addr1.address)).to
          .be.reverted;
      });

      // Distributorに十分なトークン残高がない場合のクレーム
      it("claim_success_2", async function () {
        const { factory, distributorReceiver, ymwk, owner, addr1 } =
          await loadFixture(deployFactoryAndTemplateFixture);

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
          "0",
          undefined,
          templateNameReceiver,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        await ymwk.transfer(
          distributorReceiver.target,
          ethers.parseEther("50"),
        );

        await expect(
          distributorReceiver.connect(addr1).claim(addr1.address),
        ).to.changeTokenBalances(
          ymwk,
          [distributorReceiver, addr1],
          [ethers.parseEther("-50"), ethers.parseEther("50")],
        );

        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          ethers.parseEther("50"),
        );
      });

      // Distributorのトークン残高が0の場合のクレーム
      it("claim_success_3", async function () {
        const { factory, distributorReceiver, owner, addr1 } =
          await loadFixture(deployFactoryAndTemplateFixture);

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
          "0",
          undefined,
          templateNameReceiver,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        const befScore = await distributorReceiver.scores(addr1.address);

        distributorReceiver.connect(addr1).claim(addr1.address);

        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          befScore,
        );
      });

      // 別アドレス宛のクレーム
      it("claim_success_4", async function () {
        const { factory, distributorReceiver, ymwk, owner, addr1, addr2 } =
          await loadFixture(deployFactoryAndTemplateFixture);

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
          "0",
          undefined,
          templateNameReceiver,
        );

        await timeTravel(DAY);

        await sendEther(sale.target, "1", addr1);

        await timeTravel(DAY);

        await sale.connect(addr1).claim(addr1.address, addr1.address);

        await ymwk.transfer(
          distributorReceiver.target,
          ethers.parseEther("50"),
        );

        await expect(
          distributorReceiver.connect(addr2).claim(addr1.address),
        ).to.changeTokenBalances(
          ymwk,
          [distributorReceiver, addr1, addr2],
          [
            ethers.parseEther("-50"),
            ethers.parseEther("50"),
            ethers.parseEther("0"),
          ],
        );

        expect(await distributorReceiver.scores(addr1.address)).to.be.equal(
          ethers.parseEther("50"),
        );
      });
    });
  });
});
