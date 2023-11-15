const { ethers } = require("hardhat");
import { BigNumber, Contract } from "ethers";
import { encode } from "./helper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const saleTemplateName = ethers.utils.formatBytes32String("sale");

export function getTokenAbiArgs(
  templateName: string,
  {
    initialSupply,
    name,
    symbol,
    owner,
  }: {
    initialSupply: BigNumber;
    name: string;
    symbol: string;
    owner: string;
  }
) {
  let types;
  if (!templateName || templateName.length == 0)
    throw new Error(
      `scenarioHelper::getTokenAbiArgs() -> templateName is empty.`
    );
  if (templateName.indexOf("OwnableToken") == 0) {
    types = ["uint", "string", "string", "address"];
  } else {
    console.trace(
      `${templateName} is not planned yet. Add your typedef for abi here.`
    );
    throw 1;
  }
  return encode(types, [initialSupply, name, symbol, owner]);
}

export function getSaleAbiArgs(
  templateName: string,
  {
    token,
    owner,
    start,
    eventDuration,
    allocatedAmount,
    minEtherTarget,
  }: {
    token: string;
    owner: string;
    start: number /* unixtime in sec (not milisec) */;
    eventDuration: number /* in sec */;
    allocatedAmount: BigNumber;
    minEtherTarget: BigNumber;
  }
) {
  let types;
  if (!templateName || templateName.length == 0)
    throw new Error(
      `scenarioHelper::getBulksaleAbiArgs() -> templateName is empty.`
    );
  if (templateName.indexOf(saleTemplateName) == 0) {
    types = ["address", "address", "uint", "uint", "uint", "uint"];
  } else if (templateName == "ERC20CRV.vy") {
    // for revert test
    types = [
      "address",
      "uint",
      "uint",
      "uint",
      "uint",
      "uint",
      "uint",
      "address",
      "uint",
    ];
  } else {
    console.trace(
      `${templateName} is not planned yet. Add your typedef for abi here.`
    );
    throw 1;
  }

  return encode(types, [
    token,
    owner,
    start,
    eventDuration,
    allocatedAmount,
    minEtherTarget,
  ]);
}

export async function sendERC20(
  erc20contract: any,
  to: any,
  amountStr: string,
  signer: any
) {
  let sendResult = await (
    await signer.sendTransaction({
      to: to,
      value: ethers.utils.parseEther(amountStr),
    })
  ).wait();
}
export async function sendEther(to: any, amountStr: string, signer: any) {
  let sendResult = await (
    await signer.sendTransaction({
      to: to,
      value: ethers.utils.parseEther(amountStr),
    })
  ).wait();
}

const templateName = ethers.utils.formatBytes32String("TemplateV1");
export async function deploySaleTemplate(
  factory: any,
  tokenAddr: string,
  ownerAddr: string,
  allocatedAmount: any,
  startingAt: number,
  eventDuration: number,
  minRaisedAmount: any,
  creationFee?: string
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
    ]
  );
  const tx = creationFee
    ? await factory.deployAuction(templateName, args, { value: creationFee })
    : await factory.deployAuction(templateName, args);
  const receipt = await tx.wait();
  const event = receipt.events.find((event: any) => event.event === "Deployed");
  const [, templateAddr] = event.args;
  const Sale = await ethers.getContractFactory("TemplateV1");
  return await Sale.attach(templateAddr);
}

export async function timeTravel(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

export async function timeTravelTo(timestamp: number) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

export async function snapshot() {
  return ethers.provider.send("evm_snapshot", []);
}

export async function deploySampleSaleTemplate(
  factory: Contract,
  feeDistributor: Contract,
  token: Contract,
  auctionToken: Contract,
  templateName: string,
  deployer: SignerWithAddress
): Promise<Contract> {
  const Distributor = await ethers.getContractFactory("Distributor");
  const Template = await ethers.getContractFactory("SampleTemplate");
  const FeePool = await ethers.getContractFactory("FeePool");

  const feePool = await FeePool.deploy();
  await feePool.deployed();

  const distributor = await Distributor.deploy(factory.address, token.address);
  await distributor.deployed();

  const template = await Template.deploy(
    factory.address,
    feePool.address,
    distributor.address,
    feeDistributor.address
  );
  await template.deployed();

  await factory.addTemplate(
    templateName,
    template.address,
    Template.interface.getSighash("initialize"),
    Template.interface.getSighash("initializeTransfer")
  );

  const abiCoder = ethers.utils.defaultAbiCoder;
  const args = abiCoder.encode(
    ["address", "uint256"],
    [auctionToken.address, 0]
  );
  const tx = await factory.connect(deployer).deployAuction(templateName, args);
  const receipt = await tx.wait();
  const event = receipt.events.find((event: any) => event.event === "Deployed");
  const [, templateAddr] = event.args;
  return Template.attach(templateAddr);
}

export async function restore(snapshotId: string): Promise<void> {
  return ethers.provider.send("evm_revert", [snapshotId]);
}
