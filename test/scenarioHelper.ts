import { ethers } from "hardhat";
import type { TransactionReceipt } from "ethers";
import { TemplateV1 } from "../typechain-types/contracts/TemplateV1";
import {
  DistributorReceiver,
  Factory,
  FeeDistributor,
  MockToken,
  SampleTemplate,
  SampleToken,
  TemplateV1_5,
  YMWK,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

export async function sendERC20(
  erc20contract: any,
  to: any,
  amountStr: string,
  signer: any
) {
  let sendResult = await (
    await signer.sendTransaction({
      to: to,
      value: ethers.parseEther(amountStr),
    })
  ).wait();
}
export async function sendEther(to: any, amountStr: string, signer: any) {
  let sendResult = await (
    await signer.sendTransaction({
      to: to,
      value: ethers.parseEther(amountStr),
    })
  ).wait();
}

const templateName = ethers.encodeBytes32String("TemplateV1");
export async function deploySaleTemplate(
  factory: any,
  tokenAddr: string,
  ownerAddr: string,
  allocatedAmount: any,
  startingAt: number,
  eventDuration: number,
  minRaisedAmount: any,
  creationFee?: bigint,
  templateName_?: string
): Promise<TemplateV1> {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const args = abiCoder.encode(
    ["address", "uint256", "uint256", "address", "uint256", "uint256"],
    [
      ownerAddr,
      startingAt,
      eventDuration,
      tokenAddr,
      allocatedAmount,
      minRaisedAmount,
    ]
  );
  const tx = creationFee
    ? await factory.deployAuction(templateName_ ?? templateName, args, {
        value: creationFee,
      })
    : await factory.deployAuction(templateName_ ?? templateName, args);

  const receipt: TransactionReceipt = await tx.wait();

  const templateAddr = await getTemplateAddr(receipt);
  const Sale = await ethers.getContractFactory("TemplateV1");
  return Sale.attach(templateAddr) as TemplateV1;
}

export async function deployCCIPRouter(linkReceiver: string): Promise<{
  chainSelector: bigint;
  sourceRouter: string;
  destinationRouter: string;
  wrappedNative: SampleToken;
  linkToken: SampleToken;
}> {
  const localSimulatorFactory =
    await ethers.getContractFactory("CCIPLocalSimulator");
  const localSimulator = await localSimulatorFactory.deploy();

  const config: {
    chainSelector_: bigint;
    sourceRouter_: string;
    destinationRouter_: string;
    wrappedNative_: string;
    linkToken_: string;
    ccipBnM_: string;
    ccipLnM_: string;
  } = await localSimulator.configuration();

  localSimulator.requestLinkFromFaucet(linkReceiver, ethers.parseEther("1"));

  const linkToken = await ethers.getContractAt(
    "SampleToken",
    config.linkToken_
  );
  const wrappedNative = await ethers.getContractAt(
    "SampleToken",
    config.wrappedNative_
  );

  return {
    chainSelector: config.chainSelector_,
    sourceRouter: config.sourceRouter_,
    destinationRouter: config.destinationRouter_,
    wrappedNative: wrappedNative,
    linkToken,
  };
}

export async function timeTravel(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

/**
 * Parses a transaction receipt to extract the deployed template address
 * Scans through transaction logs to find a `Deployed` event and then decodes it to an object
 *
 * @param {TransactionReceipt} receipt - The transaction receipt from the `deployAuction` call
 * @returns {string} Returns either the sent message or empty string if provided receipt does not contain `Deployed` log
 */
export async function getTemplateAddr(receipt: TransactionReceipt | null) {
  if (receipt === null) return "";
  const contractFactory = await ethers.getContractFactory("Factory");
  const iContract = contractFactory.interface;

  for (const log of receipt.logs) {
    try {
      const parsedLog = iContract.parseLog(log);
      if (parsedLog?.name == `Deployed`) {
        const [, templateAddr] = parsedLog?.args;
        return templateAddr as string;
      }
    } catch (error) {
      return "";
    }
  }

  return "";
}
export async function timeTravelTo(timestamp: number) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

export async function snapshot() {
  return ethers.provider.send("evm_snapshot", []);
}

export async function deploySampleSaleTemplate(
  factory: Factory,
  feeDistributor: FeeDistributor,
  token: MockToken | YMWK,
  auctionToken: MockToken,
  templateName: string,
  deployer: SignerWithAddress
): Promise<SampleTemplate> {
  const Distributor = await ethers.getContractFactory("Distributor");
  const Template = await ethers.getContractFactory("SampleTemplate");
  const FeePool = await ethers.getContractFactory("FeePool");

  const feePool = await FeePool.deploy();
  await feePool.waitForDeployment();

  const distributor = await Distributor.deploy(factory.target, token.target);
  await distributor.waitForDeployment();

  const template = await Template.deploy(
    factory.target,
    feePool.target,
    distributor.target,
    feeDistributor.target
  );
  await template.waitForDeployment();

  await factory.addTemplate(
    templateName,
    template.target,
    Template.interface.getFunction("initialize")!.selector,
    Template.interface.getFunction("initializeTransfer")!.selector
  );

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const args = abiCoder.encode(
    ["address", "uint256"],
    [auctionToken.target, 0]
  );
  const tx = await factory.connect(deployer).deployAuction(templateName, args);
  const receipt = await tx.wait();
  const templateAddr = await getTemplateAddr(receipt);
  return Template.attach(templateAddr) as SampleTemplate;
}

export async function deploySaleTemplateV1_5(
  factory: Factory,
  feeDistributor: FeeDistributor,
  ymwk: YMWK,
  auctionTokenAddr: string,
  allocatedAmount: any,
  startingAt: number,
  eventDuration: number,
  minRaisedAmount: any,
  deployer: SignerWithAddress
): Promise<{
  auction: TemplateV1_5;
  templateName: string;
  feeDistributor: FeeDistributor;
  distributor: DistributorReceiver;
}> {
  const { destinationRouter } = await deployCCIPRouter(deployer.address);
  const Distributor = await ethers.getContractFactory("DistributorReceiver");
  const Template = await ethers.getContractFactory("TemplateV1_5");

  const distributor = await Distributor.deploy(
    factory.target,
    ymwk.target,
    destinationRouter
  );
  await distributor.waitForDeployment();

  const template = await Template.deploy(
    factory.target,
    feeDistributor.target,
    distributor.target
  );
  await template.waitForDeployment();

  await factory.addTemplate(
    templateName,
    template.target,
    Template.interface.getFunction("initialize")!.selector,
    Template.interface.getFunction("initializeTransfer")!.selector
  );

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const args = abiCoder.encode(
    ["address", "uint256", "uint256", "address", "uint256", "uint256"],
    [
      deployer.address,
      startingAt,
      eventDuration,
      auctionTokenAddr,
      allocatedAmount,
      minRaisedAmount,
    ]
  );
  const tx = await factory.connect(deployer).deployAuction(templateName, args);
  const receipt = await tx.wait();
  const templateAddr = await getTemplateAddr(receipt);
  return {
    auction: Template.attach(templateAddr) as TemplateV1_5,
    templateName,
    feeDistributor,
    distributor,
  };
}

export async function restore(snapshotId: string): Promise<void> {
  return ethers.provider.send("evm_revert", [snapshotId]);
}
