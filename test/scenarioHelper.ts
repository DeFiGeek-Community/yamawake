import { ethers } from "hardhat";
import type { TransactionReceipt } from "ethers";
import { TemplateV1 } from "../typechain-types/contracts/TemplateV1";
import { SampleToken } from "../typechain-types";

const saleTemplateName = ethers.encodeBytes32String("sale");

export async function sendERC20(
  erc20contract: any,
  to: any,
  amountStr: string,
  signer: any,
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
  templateName_?: string,
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
    ],
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
    config.linkToken_,
  );
  const wrappedNative = await ethers.getContractAt(
    "SampleToken",
    config.wrappedNative_,
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
