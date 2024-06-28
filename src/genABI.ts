import { readFileSync } from "fs";
import { Interface } from "ethers";

export function genABI(filename: string) {
  return new Interface(
    JSON.parse(
      readFileSync(
        `artifacts/contracts/${filename}.sol/${filename}.json`
      ).toString()
    ).abi
  );
}
