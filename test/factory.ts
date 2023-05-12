const { expect } = require("chai");
const { ethers } = require("hardhat");
import { loadFixture, time }  from"@nomicfoundation/hardhat-network-helpers";
import { getTokenAbiArgs, getSaleAbiArgs } from "./scenarioHelper";

describe("BulkSaleDapp", function () {
    const saleTemplateName = ethers.utils.formatBytes32String("sale");
    const tokenTemplateName = ethers.utils.formatBytes32String("token");
    const initialSupply = ethers.utils.parseEther("1000");

    const feeRatePerMil = 1;
    const DAY = 24 * 60 * 60;

    async function deployFactoryFixture() {
        const [owner, addr1] = await ethers.getSigners();
    
        const Factory = await ethers.getContractFactory("Factory");
        const factory = await Factory.deploy();
        await factory.deployed();
        console.log(factory.address);
        return { factory, owner, addr1 };
    }

    async function deployFactoryAndTemplateFixture() {
        const {factory, owner, addr1} = await loadFixture(deployFactoryFixture);
    
        const Sale = await ethers.getContractFactory("BulksaleV1");
        const sale = await Sale.deploy();
        await sale.deployed();
    
        const Token = await ethers.getContractFactory("OwnableToken");
        const token = await Token.deploy();
        await token.deployed();

        await factory.addTemplate(saleTemplateName, sale.address);
        await factory.addTemplate(tokenTemplateName, token.address);

        return { factory, sale, token, owner, addr1 };
    }

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

            const sellingAmount = ethers.utils.parseEther("1")
            await token.approve(factory.address, sellingAmount);
            const now = await time.latest();
            const saleOpts = {
                token: token.address,
                start: now + DAY,
                eventDuration: DAY,
                lockDuration: DAY,
                expirationDuration: 30 * DAY,
                sellingAmount: sellingAmount,
                minEtherTarget: ethers.utils.parseEther("0.1"),
                owner: owner.address,
                feeRatePerMil: feeRatePerMil,
            };

            const argsForSaleClone = getSaleAbiArgs(saleTemplateName, saleOpts);

            await expect(factory.deploySaleClone(saleTemplateName, token.address, sellingAmount, argsForSaleClone)).to.not.be.reverted;
        });
    });
});