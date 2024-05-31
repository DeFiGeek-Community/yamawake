import { ethers } from "hardhat";
import type { TransactionReceipt, Log } from "ethers";
import { TemplateV1 } from "../typechain-types/contracts/TemplateV1";

const saleTemplateName = ethers.encodeBytes32String("sale");

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
  creationFee?: bigint
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
    ? await factory.deployAuction(templateName, args, { value: creationFee })
    : await factory.deployAuction(templateName, args);

  const receipt: TransactionReceipt = await tx.wait();

  const templateAddr = await getTemplateAddr(receipt);
  const Sale = await ethers.getContractFactory("TemplateV1");
  return Sale.attach(templateAddr) as TemplateV1;
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
export async function getTemplateAddr(receipt: TransactionReceipt) {
  const Sale = await ethers.getContractFactory("TemplateV1");
  const iContract = Sale.interface;

  for (const log of receipt.logs) {
    try {
      const parsedLog = iContract.parseLog(log);
      if (parsedLog?.name == `Deployed`) {
        const [templateAddr] = parsedLog?.args;
        return templateAddr as string;
      }
    } catch (error) {
      return "";
    }
  }

  return "";
}
