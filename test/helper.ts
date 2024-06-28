import { ethers } from "hardhat";

export function parseAddr(addr: string) {
  if (!addr) throw new Error("Error: helper.parseAddr(undefined)");
  return `0x${addr.slice(26, addr.length)}`;
}
export function parseBool(bytes: string) {
  return parseInt(bytes.slice(bytes.length - 1, bytes.length)) === 1;
}
export function parseInteger(bytes: string) {
  bytes = bytes.slice(2, bytes.length);
  return parseInt(bytes);
}

export function toERC20(amount: string, decimal: number = 18): BigInt {
  return ethers.parseUnits(amount, decimal);
}
export function toFloat(amount: string, decimal: number = 18): string {
  return ethers.formatUnits(amount, decimal);
}

export function abs(value: bigint) {
  return value < 0n ? -value : value;
}
