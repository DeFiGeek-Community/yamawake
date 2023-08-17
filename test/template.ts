const { expect } = require("chai");
const { ethers } = require("hardhat");
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  getTokenAbiArgs,
  getSaleAbiArgs,
  sendEther,
  timeTravel,
} from "./scenarioHelper";

describe("TemplateV1", function () {
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

    async function deployFactoryAndTemplateFixture() {
        const { factory, feePool, owner, addr1, addr2 } = await loadFixture(
        deployFactoryAndFeePoolFixture,
        );

        const Template = await ethers.getContractFactory("TemplateV1");
        const template = await Template.deploy(factory.address, feePool.address);
        await template.deployed();

        await factory.addTemplate(
        templateName,
        template.address,
        Template.interface.getSighash("initialize"),
        Template.interface.getSighash("initializeTransfer"),
        );

        return { factory, feePool, template, owner, addr1, addr2 };
    }

    async function deployTokenFixture() {
        const Token = await ethers.getContractFactory("SampleToken");
        const token = await Token.deploy(initialSupply);
        await token.deployed();

        return { token };
    }

    async function deploySaleTemplate(
        factory: any,
        tokenAddr: string,
        ownerAddr: string,
        allocatedAmount: any,
        startingAt: number,
        eventDuration: number,
        minRaisedAmount: any,
    ) {
        const abiCoder = ethers.utils.defaultAbiCoder;
        const args = abiCoder.encode(
        ["address", "uint256", "uint256", "address", "uint256", "uint256"],
        [
            ownerAddr,
            startingAt,
            eventDuration,
            tokenAddr,
            allocatedAmount,
            minRaisedAmount,
        ],
        );
        const tx = await factory.deployAuction(templateName, args);
        const receipt = await tx.wait();
        const event = receipt.events.find(
        (event: any) => event.event === "Deployed",
        );
        const [, templateAddr] = event.args;
        const Sale = await ethers.getContractFactory("TemplateV1");
        return await Sale.attach(templateAddr);
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

            await expect(factory.deployAuction(templateName, args)).to.be
            .revertedWith("Go with non null address.");
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

            await expect(factory.deployAuction(templateName, args)).to.be
            .revertedWith("owner must be there");
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

            await expect(factory.deployAuction(templateName, args)).to.be.revertedWith("allocatedAmount must be greater than or equal to 1e6.");
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

            await expect(factory.deployAuction(templateName, args)).to.be.revertedWith("allocatedAmount must be less than or equal to 1e50.");
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
            [
                owner.address,
                now + 1,
                DAY,
                token.address,
                allocatedAmount,
                "0",
            ],
            );

            await expect(factory.deployAuction(templateName, args)).to.not.be.reverted;
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
            [
                owner.address,
                now - 1,
                DAY,
                token.address,
                allocatedAmount,
                "0",
            ],
            );

            await expect(factory.deployAuction(templateName, args)).to.be.revertedWith("startingAt must be in the future");
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
            [
                owner.address,
                now + DAY,
                DAY,
                token.address,
                allocatedAmount,
                "0",
            ],
            );

            await expect(factory.deployAuction(templateName, args)).to.not.be.reverted;
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

            await expect(factory.deployAuction(templateName, args)).to.be.revertedWith("event duration is too short");
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

            await expect(factory.deployAuction(templateName, args)).to.be.revertedWith("event duration is too long");
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

            await expect(factory.deployAuction(templateName, args1)).to.not.be.reverted;
            await expect(factory.deployAuction(templateName, args2)).to.not.be.reverted;
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

            await expect(factory.deployAuction(templateName, args)).to.be.revertedWith("minRaisedAmount must be less than or equal to 1e27.");
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

            await expect(template.initialize(
                owner.address,
                now + DAY,
                DAY,
                token.address,
                allocatedAmount,
                minRaisedAmount
            )).to.be
            .revertedWith("You are not the factory.");
        });
    });

    describe("Receive", function () {
        it("reverts with 'The offering has not started yet'", async function () {
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

        it("receives ether", async function () {
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
        await sendEther(sale.address, "1", owner);
        const balance = await ethers.provider.getBalance(sale.address);
        const raised = await sale.raised(owner.address);

        await expect(balance.toString()).to.eq(ethers.utils.parseEther("1"));
        await expect(raised.toString()).to.eq(ethers.utils.parseEther("1"));
        });
    });

    describe("Claim", function () {
        it("sends token to the claimer when allocatedAmount < totalRaised", async function () {
        const { factory, owner, addr1, addr2 } = await loadFixture(
            deployFactoryAndTemplateFixture,
        );
        const { token } = await loadFixture(deployTokenFixture);

        const allocatedAmount = ethers.utils.parseEther("0.9");
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
        await sendEther(sale.address, "1", addr1);
        await sendEther(sale.address, "1", addr2);
        await timeTravel(DAY);
        await sale.claim(addr1.address, addr1.address);
        await sale.claim(addr2.address, addr2.address);
        const user1TokenBalance = await token.balanceOf(addr1.address);
        const user2TokenBalance = await token.balanceOf(addr2.address);
        const contractTokenBalance = await token.balanceOf(sale.address);

        await expect(user1TokenBalance.toString()).to.eq(
            ethers.utils.parseEther("0.45"),
        );
        await expect(user2TokenBalance.toString()).to.eq(
            ethers.utils.parseEther("0.45"),
        );
        await expect(contractTokenBalance.toString()).to.eq("0");
        });

        it("sends tokens to the claimer when allocatedAmount > totalRaised", async function () {
        const { factory, owner, addr1, addr2 } = await loadFixture(
            deployFactoryAndTemplateFixture,
        );
        const { token } = await loadFixture(deployTokenFixture);

        const allocatedAmount = ethers.utils.parseEther("1.9");
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
        await sendEther(sale.address, "0.5", addr1);
        await sendEther(sale.address, "0.5", addr2);
        await timeTravel(DAY);
        await sale.claim(addr1.address, addr1.address);
        await sale.claim(addr2.address, addr2.address);
        const user1TokenBalance = await token.balanceOf(addr1.address);
        const user2TokenBalance = await token.balanceOf(addr2.address);
        const contractTokenBalance = await token.balanceOf(sale.address);

        await expect(user1TokenBalance.toString()).to.eq(
            ethers.utils.parseEther("0.95"),
        );
        await expect(user2TokenBalance.toString()).to.eq(
            ethers.utils.parseEther("0.95"),
        );
        await expect(contractTokenBalance.toString()).to.eq("0");
        });
    });

    describe("receive", function () {
        it("入札する_success_正常な入札", async function () {
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
        await sendEther(sale.address, "0.001", owner);

        await expect(await sale.totalRaised()).to.be.eq(
            ethers.utils.parseEther("0.001"),
        );
        await expect(await sale.raised(owner.address)).to.be.eq(
            ethers.utils.parseEther("0.001"),
        );
        });

        it("入札する_fail_最低入札金額以下の入札", async function () {
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

        await expect(
            sendEther(sale.address, "0.0009", owner),
        ).to.be.revertedWith(
            "The amount must be greater than or equal to 0.001ETH",
        );
        });
    });
    describe("withdrawRaisedETH", function () {
        it("売り上げを回収する_success_成功したセールの売上回収", async function () {
        const { factory, feePool, owner } = await loadFixture(
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
        await sendEther(sale.address, "1", owner);

        await timeTravel(DAY * 4);
        await expect(
            sale.connect(owner).withdrawRaisedETH(),
        ).to.changeEtherBalances(
            [owner.address, sale.address, feePool.address],
            [
            ethers.utils.parseEther("0.99"),
            ethers.utils.parseEther("-1"),
            ethers.utils.parseEther("0.01"),
            ],
        );
        });

        it("売り上げを回収する_fail_セール期間中の売上回収", async function () {
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
        await sendEther(sale.address, "1", owner);

        await expect(
            sale.connect(owner).withdrawRaisedETH(),
        ).to.be.revertedWith("Withdrawal unavailable yet.");
        });

        it("売り上げを回収する_fail_成功したセールのオーナーアドレス以外からの売上回収", async function () {
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
            ethers.utils.parseEther("0.1"),
        );

        await timeTravel(DAY);
        await sendEther(sale.address, "1", owner);

        await timeTravel(DAY * 4);
        await expect(sale.connect(addr1).withdrawRaisedETH()).to.be.reverted;
        });

        it("売り上げを回収する_success_成功したセールの売上ロック期間中かつ最低入札額で割当1以上の場合の売上回収", async function () {
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

        it("売り上げを回収する_fail_成功したセールの売上ロック期間中かつ最低入札額で割当0になる場合の売上回収", async function () {
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

        await expect(
            sale.connect(owner).withdrawRaisedETH(),
        ).to.be.revertedWith(
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

        it("売り上げを回収する_fail_失敗したセールの売上回収", async function () {
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
            sale.connect(owner).withdrawRaisedETH(),
        ).to.be.revertedWith("The required amount has not been raised!");
        });

        // it("売り上げを回収する_success_成功したが割当者がいないセールの売上回収（トークンのGOX）", async function () {
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