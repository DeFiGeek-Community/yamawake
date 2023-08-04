const { expect } = require("chai");
const { ethers } = require("hardhat");
import { loadFixture, time }  from"@nomicfoundation/hardhat-network-helpers";
import { getTokenAbiArgs, getSaleAbiArgs, sendEther, timeTravel } from "./scenarioHelper";

describe("BulkSaleDapp", function () {
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
        const {factory, feePool, owner, addr1, addr2 } = await loadFixture(deployFactoryAndFeePoolFixture);
    
        const Template = await ethers.getContractFactory("TemplateV1");
        const template = await Template.deploy(factory.address, feePool.address);
        await template.deployed();

    
        await factory.addTemplate(templateName, template.address, Template.interface.getSighash("initialize"),Template.interface.getSighash("initializeTransfer"));

        return { factory, feePool, template, owner, addr1, addr2 };
    }

    async function deployTokenFixture() {
        const Token = await ethers.getContractFactory("SampleToken");
        const token = await Token.deploy(initialSupply);
        await token.deployed();
    
        return { token };
      }

    async function deploySaleTemplate(factory: any, tokenAddr: string, ownerAddr: string, allocatedAmount: any, startingAt: number, eventDuration: number, minRaisedAmount: any) {
        const abiCoder = ethers.utils.defaultAbiCoder;
        const args = abiCoder.encode(["address","uint256","uint256","address","uint256","uint256"],[ownerAddr,startingAt,eventDuration,tokenAddr,allocatedAmount,minRaisedAmount]);
        const tx = await factory.deployAuction(templateName, args);
        const receipt = await tx.wait()
        const event = receipt.events.find((event: any) => event.event === 'Deployed');
        const [, templateAddr] = event.args;
        const Sale = await ethers.getContractFactory("TemplateV1");
        return await Sale.attach(templateAddr);
    }

    describe("Deploy Factory", function () {
        it("Factory", async function () {
            await loadFixture(deployFactoryAndFeePoolFixture);
          });

        it("Factory and Templates", async function () {
            await loadFixture(deployFactoryAndTemplateFixture);
        });
        it("Fail by same template name", async function () {
            const {factory, template} = await loadFixture(deployFactoryAndTemplateFixture);
            await expect(factory.addTemplate(templateName, template.address,template.interface.getSighash("initialize"),template.interface.getSighash("initializeTransfer"))).to.be.reverted;
        });
        it("Fail by not owner", async function () {
            const {factory, template, addr1} = await loadFixture(deployFactoryAndTemplateFixture);
            const templateName2 = ethers.utils.hexZeroPad(
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes("sale2")),
                32
            );
            await expect(factory.connect(addr1).addTemplate(templateName2, template.address,template.interface.getSighash("initialize"),template.interface.getSighash("initializeTransfer"))).to.be.reverted;
        });
    });

    describe("Deploy Clone", function () {
        it("sale", async function () {
            const {factory, owner} = await loadFixture(deployFactoryAndTemplateFixture);
            const Token = await ethers.getContractFactory("SampleToken");
            const token = await Token.deploy(initialSupply);
            await token.deployed();

            const allocatedAmount = ethers.utils.parseEther("1")
            await token.approve(factory.address, allocatedAmount);
            const now = await time.latest();

            const abiCoder = ethers.utils.defaultAbiCoder;
            const args = abiCoder.encode(["address","uint256","uint256","address","uint256","uint256"],[owner.address,now + DAY,DAY,token.address,allocatedAmount,ethers.utils.parseEther("0.1")]);

            await expect(factory.deployAuction(templateName, args)).to.not.be.reverted;
        });

        it("reverts with allocatedAmount which exceeds the limit", async function () {
            const {factory, owner} = await loadFixture(deployFactoryAndTemplateFixture);
            const Token = await ethers.getContractFactory("SampleToken");
            const initialSupply = ethers.BigNumber.from(10).pow(50).add(1);
            const token = await Token.deploy(initialSupply);
            await token.deployed();

            const allocatedAmount = initialSupply
            await token.approve(factory.address, allocatedAmount);
            const now = await time.latest();

            const abiCoder = ethers.utils.defaultAbiCoder;
            const args = abiCoder.encode(["address","uint256","uint256","address","uint256","uint256"],[owner.address,now + DAY,DAY,token.address,allocatedAmount,ethers.utils.parseEther("0.1")]);
    
            await expect(factory.deployAuction(templateName, args)).to.be.reverted;
        });

        it("does not revert with allocatedAmount which is below the limit", async function () {
            const {factory, owner} = await loadFixture(deployFactoryAndTemplateFixture);
            const Token = await ethers.getContractFactory("SampleToken");
            const initialSupply = ethers.BigNumber.from(10).pow(50);
            const token = await Token.deploy(initialSupply);
            await token.deployed();

            const allocatedAmount = initialSupply
            await token.approve(factory.address, allocatedAmount);
            const now = await time.latest();

            const abiCoder = ethers.utils.defaultAbiCoder;
            const args = abiCoder.encode(["address","uint256","uint256","address","uint256","uint256"],[owner.address,now + DAY,DAY,token.address,allocatedAmount,ethers.utils.parseEther("0.1")]);
    
            await expect(factory.deployAuction(templateName, args)).to.not.be.reverted;
        });

        it("reverts with minRaisedAmount which exceeds the limit", async function () {
            const {factory, owner} = await loadFixture(deployFactoryAndTemplateFixture);
            const Token = await ethers.getContractFactory("SampleToken");
            const initialSupply = ethers.utils.parseEther("100");
            const minRaisedAmount = ethers.BigNumber.from(10).pow(27).add(1);
            const token = await Token.deploy(initialSupply);
            await token.deployed();

            const allocatedAmount = initialSupply
            await token.approve(factory.address, allocatedAmount);
            const now = await time.latest();

            const abiCoder = ethers.utils.defaultAbiCoder;
            const args = abiCoder.encode(["address","uint256","uint256","address","uint256","uint256"],[owner.address,now + DAY,DAY,token.address,allocatedAmount,minRaisedAmount]);
    
            await expect(factory.deployAuction(templateName, args)).to.be.reverted;
        });

        it("does not revert with minRaisedAmount which is below the limit", async function () {
            const {factory, owner} = await loadFixture(deployFactoryAndTemplateFixture);
            const Token = await ethers.getContractFactory("SampleToken");
            const initialSupply = ethers.utils.parseEther("100");
            const minRaisedAmount = ethers.BigNumber.from(10).pow(27);
            const token = await Token.deploy(initialSupply);
            await token.deployed();

            const allocatedAmount = initialSupply
            await token.approve(factory.address, allocatedAmount);
            const now = await time.latest();

            const abiCoder = ethers.utils.defaultAbiCoder;
            const args = abiCoder.encode(["address","uint256","uint256","address","uint256","uint256"],[owner.address,now + DAY,DAY,token.address,allocatedAmount,minRaisedAmount]);
    
            await expect(factory.deployAuction(templateName, args)).to.not.be.reverted;
        });

        it("セール立ち上げを申し込む_success_allocatedAmountの境界値", async function () {
            const {factory, owner} = await loadFixture(deployFactoryAndTemplateFixture);
            const Token = await ethers.getContractFactory("SampleToken");
            const initialSupply = ethers.BigNumber.from(10).pow(6);
            const token = await Token.deploy(initialSupply);
            await token.deployed();

            const allocatedAmount = initialSupply
            await token.approve(factory.address, allocatedAmount);
            const now = await time.latest();

            const abiCoder = ethers.utils.defaultAbiCoder;
            const args = abiCoder.encode(["address","uint256","uint256","address","uint256","uint256"],[owner.address,now + DAY,DAY,token.address,allocatedAmount,ethers.utils.parseEther("0.1")]);
    
            await expect(factory.deployAuction(templateName, args)).to.not.be.reverted;
        });

        it("セール立ち上げを申し込む_fail_allocatedAmountの境界値", async function () {
            const {factory, owner} = await loadFixture(deployFactoryAndTemplateFixture);
            const Token = await ethers.getContractFactory("SampleToken");
            const initialSupply = ethers.BigNumber.from(10).pow(6).sub(1);
            const token = await Token.deploy(initialSupply);
            await token.deployed();

            const allocatedAmount = initialSupply
            await token.approve(factory.address, allocatedAmount);
            const now = await time.latest();

            const abiCoder = ethers.utils.defaultAbiCoder;
            const args = abiCoder.encode(["address","uint256","uint256","address","uint256","uint256"],[owner.address,now + DAY,DAY,token.address,allocatedAmount,ethers.utils.parseEther("0.1")]);
    
            await expect(factory.deployAuction(templateName, args)).to.be.revertedWith("allocatedAmount must be greater than or equal to 1e6.");
        });
    });

    describe("Template", function() {
        describe("Receive", function() {
            it("reverts with 'The offering has not started yet'", async function () {
                const {factory, owner} = await loadFixture(deployFactoryAndTemplateFixture);
                const {token} = await loadFixture(deployTokenFixture);

                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await expect(sendEther(sale.address, "1", owner)).to.be.revertedWith('The offering has not started yet')
            })

            it("receives ether", async function () {
                const {factory, owner} = await loadFixture(deployFactoryAndTemplateFixture);
                const {token} = await loadFixture(deployTokenFixture);

                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));
                await timeTravel(DAY);
                await sendEther(sale.address, "1", owner)
                const balance = await ethers.provider.getBalance(sale.address);
                const raised = await sale.raised(owner.address);
    
                await expect(balance.toString()).to.eq(ethers.utils.parseEther("1"))
                await expect(raised.toString()).to.eq(ethers.utils.parseEther("1"))
            })
        });

        describe("Claim", function() {
            it("sends token to the claimer when allocatedAmount < totalRaised", async function () {
                const {factory, owner, addr1, addr2} = await loadFixture(deployFactoryAndTemplateFixture);
                const {token} = await loadFixture(deployTokenFixture);

                const allocatedAmount = ethers.utils.parseEther("0.9")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);
                await sendEther(sale.address, "1", addr1)
                await sendEther(sale.address, "1", addr2)
                await timeTravel(DAY);
                await sale.claim(addr1.address, addr1.address);
                await sale.claim(addr2.address, addr2.address);
                const user1TokenBalance = await token.balanceOf(addr1.address)
                const user2TokenBalance = await token.balanceOf(addr2.address)
                const contractTokenBalance = await token.balanceOf(sale.address)
    
                await expect(user1TokenBalance.toString()).to.eq(ethers.utils.parseEther("0.45"))
                await expect(user2TokenBalance.toString()).to.eq(ethers.utils.parseEther("0.45"))
                await expect(contractTokenBalance.toString()).to.eq("0")
            });
    
            it("sends tokens to the claimer when allocatedAmount > totalRaised", async function () {
                const {factory, owner, addr1, addr2} = await loadFixture(deployFactoryAndTemplateFixture);
                const {token} = await loadFixture(deployTokenFixture);

                const allocatedAmount = ethers.utils.parseEther("1.9");
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);
                await sendEther(sale.address, "0.5", addr1)
                await sendEther(sale.address, "0.5", addr2)
                await timeTravel(DAY);
                await sale.claim(addr1.address, addr1.address);
                await sale.claim(addr2.address, addr2.address);
                const user1TokenBalance = await token.balanceOf(addr1.address)
                const user2TokenBalance = await token.balanceOf(addr2.address)
                const contractTokenBalance = await token.balanceOf(sale.address)
    
                await expect(user1TokenBalance.toString()).to.eq(ethers.utils.parseEther("0.95"))
                await expect(user2TokenBalance.toString()).to.eq(ethers.utils.parseEther("0.95"))
                await expect(contractTokenBalance.toString()).to.eq("0")
            });
        });
    });

    describe("SaleTemplateV1", function () {
        describe("receive", function () {
            it("入札する_success_正常な入札", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);
                await sendEther(sale.address, "0.001", owner);

                await expect(await sale.totalRaised()).to.be.eq(ethers.utils.parseEther("0.001"));
                await expect(await sale.raised(owner.address)).to.be.eq(ethers.utils.parseEther("0.001"));
            });

            it("入札する_fail_最低入札金額以下の入札", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);

                await expect(sendEther(sale.address, "0.0009", owner)).to.be.revertedWith("The amount must be greater than or equal to 0.001ETH");
            });
        });
        describe("withdrawRaisedETH", function () {
            it("売り上げを回収する_success_成功したセールの売上回収", async function () {
                const { factory, feePool, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);
                await sendEther(sale.address, "1", owner)

                await timeTravel(DAY*4);
                await expect(sale.connect(owner).withdrawRaisedETH()).to.changeEtherBalances([owner.address, sale.address, feePool.address], [ethers.utils.parseEther("0.99"), ethers.utils.parseEther("-1"), ethers.utils.parseEther("0.01")]);
            });

            it("売り上げを回収する_fail_セール期間中の売上回収", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);
                await sendEther(sale.address, "1", owner)

                await expect(sale.connect(owner).withdrawRaisedETH()).to.be.revertedWith("Withdrawal unavailable yet.");
            });

            it("売り上げを回収する_fail_成功したセールのオーナーアドレス以外からの売上回収", async function () {
                const { factory, owner, addr1 } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);
                await sendEther(sale.address, "1", owner)

                await timeTravel(DAY*4);
                await expect(sale.connect(addr1).withdrawRaisedETH()).to.be.reverted
            });

            it("売り上げを回収する_success_成功したセールの売上ロック期間中かつ最低入札額で割当1以上の場合の売上回収", async function () {
                const { factory, feePool, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = "10000000"
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("1"));

                await timeTravel(DAY);
                const signers = await ethers.getSigners();
                const promiseList1 = [];
                for(let i=0; i<100; i++) {
                    const signer = signers[i];
                    promiseList1.push(sendEther(sale.address, "100", signer));
                }
                await Promise.all(promiseList1);

                await timeTravel(DAY);

                await expect(sale.connect(owner).withdrawRaisedETH()).to.changeEtherBalances([owner.address, sale.address, feePool.address], [ethers.utils.parseEther("9900"), ethers.utils.parseEther("-10000"), ethers.utils.parseEther("100")]);
            });

            it("売り上げを回収する_fail_成功したセールの売上ロック期間中かつ最低入札額で割当0になる場合の売上回収", async function () {
                const { factory, feePool, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = "9999999"
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("1"));

                await timeTravel(DAY);
                const signers = await ethers.getSigners();
                const promiseList1 = [];
                for(let i=0; i<100; i++) {
                    const signer = signers[i];
                    promiseList1.push(sendEther(sale.address, "100", signer));
                }
                await Promise.all(promiseList1);

                await timeTravel(DAY);

                await expect(sale.connect(owner).withdrawRaisedETH()).to.be.revertedWith("Refund candidates may exist. Withdrawal unavailable yet.");

                await timeTravel(DAY*3);

                await expect(sale.connect(owner).withdrawRaisedETH()).to.changeEtherBalances([owner.address, sale.address, feePool.address], [ethers.utils.parseEther("9900"), ethers.utils.parseEther("-10000"), ethers.utils.parseEther("100")]);
            });

            it("売り上げを回収する_fail_失敗したセールの売上回収", async function () {
                const { factory, owner, addr1 } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("100"));

                await timeTravel(DAY);
                await sendEther(sale.address, "99", owner)

                await timeTravel(DAY*4);
                await expect(sale.connect(owner).withdrawRaisedETH()).to.be.revertedWith("The required amount has not been raised!")
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
    });
});