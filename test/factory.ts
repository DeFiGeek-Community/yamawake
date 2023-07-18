const { expect } = require("chai");
const { ethers } = require("hardhat");
import { loadFixture, time }  from"@nomicfoundation/hardhat-network-helpers";
import { backToInitMode, goToEmbededMode, hardcodeFactoryAddress, isEmbeddedMode } from "../src/deployUtil";
import { getTokenAbiArgs, getSaleAbiArgs, sendEther, timeTravel } from "./scenarioHelper";

describe("BulkSaleDapp", function () {
    const saleTemplateName = ethers.utils.formatBytes32String("sale");
    const tokenTemplateName = ethers.utils.formatBytes32String("token");
    const initialSupply = ethers.utils.parseEther("1000");

    const DAY = 24 * 60 * 60;

    async function deployFactoryFixture() {
        const [owner, addr1, addr2] = await ethers.getSigners();
    
        const Factory = await ethers.getContractFactory("FactoryV1");
        const factory = await Factory.deploy();
        await factory.deployed();

        return { factory, owner, addr1, addr2 };
    }

    async function deployFactoryAndTemplateFixture() {
        const {factory, owner, addr1, addr2 } = await loadFixture(deployFactoryFixture);
    
        const Sale = await ethers.getContractFactory("SaleTemplateV1");
        const sale = await Sale.deploy();
        await sale.deployed();
    
        await factory.addTemplate(saleTemplateName, sale.address);

        return { factory, sale, owner, addr1, addr2 };
    }

    async function deployTokenFixture() {
        const Token = await ethers.getContractFactory("SampleToken");
        const token = await Token.deploy(initialSupply);
        await token.deployed();
    
        return { token };
      }

    async function deploySaleTemplate(factory: any, tokenAddr: string, ownerAddr: string, allocatedAmount: any, startingAt: number, eventDuration: number, minRaisedAmount: any) {
        const tx = await factory.deploySaleClone(saleTemplateName, tokenAddr, ownerAddr, allocatedAmount, startingAt, eventDuration, minRaisedAmount);
        const receipt = await tx.wait()
        const event = receipt.events.find((event: any) => event.event === 'Deployed');
        const [, templateAddr] = event.args;
        const Sale = await ethers.getContractFactory("SaleTemplateV1");
        return await Sale.attach(templateAddr);
    }

    before(async function() {
        if( !isEmbeddedMode('localhost') ) {
            const { factory } = await loadFixture(deployFactoryFixture);
            hardcodeFactoryAddress("SaleTemplateV1", factory.address);
            this.skip();
        }
    })

    after(async function() {
        if( !isEmbeddedMode('localhost') ) {
            goToEmbededMode('localhost');
        } else {
            backToInitMode('localhost');
        }
    })

    describe("Deploy Factory", function () {
        it("Factory", async function () {
            await loadFixture(deployFactoryFixture);
          });

        it("Factory and Templates", async function () {
            await loadFixture(deployFactoryAndTemplateFixture);
        });
        it("Fail by same template name", async function () {
            const {factory, sale} = await loadFixture(deployFactoryAndTemplateFixture);
            await expect(factory.addTemplate(saleTemplateName, sale.address)).to.be.reverted;
        });
        it("Fail by not owner", async function () {
            const {factory, sale, addr1} = await loadFixture(deployFactoryAndTemplateFixture);
            const saleTemplateName2 = ethers.utils.hexZeroPad(
                ethers.utils.hexlify(ethers.utils.toUtf8Bytes("sale2")),
                32
            );
            await expect(factory.connect(addr1).addTemplate(saleTemplateName2, sale.address)).to.be.reverted;
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

            await expect(factory.deploySaleClone(saleTemplateName, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"))).to.not.be.reverted;
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

            await expect(factory.deploySaleClone(saleTemplateName, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"))).to.be.reverted;
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

            await expect(factory.deploySaleClone(saleTemplateName, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"))).to.not.be.reverted;
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

            await expect(factory.deploySaleClone(saleTemplateName, token.address, owner.address, allocatedAmount, now + DAY, DAY, minRaisedAmount)).to.be.reverted;
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

            await expect(factory.deploySaleClone(saleTemplateName, token.address, owner.address, allocatedAmount, now + DAY, DAY, minRaisedAmount)).to.not.be.reverted;
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
            // 正常な入札
            it("入札する_success", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);
                await sendEther(sale.address, "1", owner);

                await expect(await sale.totalRaised()).to.be.eq(ethers.utils.parseEther("1"));
                await expect(await sale.raised(owner.address)).to.be.eq(ethers.utils.parseEther("1"));
                await expect(await sale.bidderAddresses(0)).to.be.eq(owner.address);
            });

            // 金額0の入札
            it("入札する_fail", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);

                await expect(sendEther(sale.address, "0", owner)).to.be.revertedWith("The amount must be greater than 0");
            });
        });
        describe("withdrawRaisedETH", function () {
            // 成功したセールの売上回収
            it("売り上げを回収する_success", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = ethers.utils.parseEther("1")
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("0.1"));

                await timeTravel(DAY);
                await sendEther(sale.address, "1", owner)

                await timeTravel(DAY*4);
                await expect(sale.connect(owner).withdrawRaisedETH()).to.changeEtherBalances([owner.address, sale.address, factory.address], [ethers.utils.parseEther("0.99"), ethers.utils.parseEther("-1"), ethers.utils.parseEther("0.01")]);
            });

            // セール期間中の売上回収
            it("売り上げを回収する_fail", async function () {
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

            // 成功したセールのオーナーアドレス以外からの売上回収
            it("売り上げを回収する_fail", async function () {
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

            // 成功したセールの売上ロック期間中かつ返金対象者がいない場合の売上回収
            it("売り上げを回収する_success", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = "100"
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("1"));

                await timeTravel(DAY);
                const signers = await ethers.getSigners();
                const promiseList1 = [];
                for(let i=0; i<100; i++) {
                    const signer = signers[i];
                    promiseList1.push(sendEther(sale.address, "0.1", signer));
                }
                await Promise.all(promiseList1);

                await timeTravel(DAY);

                await expect(sale.connect(owner).withdrawRaisedETH()).to.changeEtherBalances([owner.address, sale.address, factory.address], [ethers.utils.parseEther("9.9"), ethers.utils.parseEther("-10"), ethers.utils.parseEther("0.1")]);
            });

            // 成功したセールの売上ロック期間中かつ返金対象者がいて未返金の場合の売上回収
            it("売り上げを回収する_fail", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = "1000"
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("1"));

                await timeTravel(DAY);
                const signers = await ethers.getSigners();
                const promiseList1 = [];
                for(let i=0; i<100; i++) {
                    const signer = signers[i];
                    promiseList1.push(sendEther(sale.address, "0.1", signer));
                }
                await Promise.all([...promiseList1, sendEther(sale.address, "0.000000000000000001", signers[100])]);

                await timeTravel(DAY);

                await expect(sale.connect(owner).withdrawRaisedETH()).to.be.revertedWith("Refund candidates exist. Withdrawal unavailable yet.");
            });

            // 成功したセールの売上ロック期間中かつ返金対象者がいて返金済の場合の売上回収
            it("売り上げを回収する_success", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = "1000"
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("1"));

                await timeTravel(DAY);
                const signers = await ethers.getSigners();
                const promiseList1 = [];
                for(let i=0; i<100; i++) {
                    const signer = signers[i];
                    promiseList1.push(sendEther(sale.address, "0.1", signer));
                }
                await Promise.all([...promiseList1, sendEther(sale.address, "0.000000000000000001", signers[100])]);

                await timeTravel(DAY);
                await sale.connect(signers[100]).claim(signers[100].address, signers[100].address)
                await expect(sale.connect(owner).withdrawRaisedETH()).to.changeEtherBalances([owner.address, sale.address, factory.address], [ethers.utils.parseEther("9.9"), ethers.utils.parseEther("-10"), ethers.utils.parseEther("0.1")]);
            });

            // 失敗したセールの売上回収
            it("売り上げを回収する_fail", async function () {
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

            // 成功したが割当者がいないセールの売上回収（トークンのGOX）
            it("売り上げを回収する_success", async function () {
                const { factory, owner } = await loadFixture(deployFactoryAndTemplateFixture);
                const { token } = await loadFixture(deployTokenFixture);
                const allocatedAmount = "100"
                await token.approve(factory.address, allocatedAmount);
                const now = await time.latest();

                const sale = await deploySaleTemplate(factory, token.address, owner.address, allocatedAmount, now + DAY, DAY, ethers.utils.parseEther("1"));

                await timeTravel(DAY);
                const signers = await ethers.getSigners();
                const promiseList1 = [];

                for(let i=0; i<101; i++) {
                    const signer = signers[i];
                    promiseList1.push(sendEther(sale.address, "0.1", signer));
                }
                await Promise.all(promiseList1);

                await timeTravel(DAY);

                const promiseList2 = [];
                for(let i=0; i<101; i++) {
                    const signer = signers[i];
                    promiseList2.push(sale.connect(signer).claim(signer.address, signer.address));
                }
                await Promise.all(promiseList2);

                await timeTravel(DAY*3);
                await expect(sale.connect(owner).withdrawRaisedETH()).to.changeEtherBalance(owner.address, "0");
            });
        });
    });
});