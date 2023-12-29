import { readFileSync, writeFileSync, existsSync } from "fs";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract } from "ethers";
import { genABI } from "./genABI";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
const hre: HardhatRuntimeEnvironment = require("hardhat");
const saleTemplateName = ".saleTemplateName";

type Options = {
  from?: SignerWithAddress | undefined;
  signer?: SignerWithAddress | undefined;
  ABI?: any | undefined;
  args?: Array<any> | undefined;
  linkings?: Array<string> | undefined;
  log?: boolean | undefined;
  getContractFactory: any;
};

export function getLocalFactoryAddress() {
  return process.env.LOCAL_FACTORY_ADDERSS;
}

export async function getFoundation(): Promise<SignerWithAddress> {
  const accounts = await ethers.getSigners();
  return accounts[0];
}

export function getContractAddress(_network: string, _name: string): string {
  return readFileSync(`deployments/${_network}/${_name}`).toString();
}

export function getDeploymentAddressPath(_network: string, _name: string) {
  return `./deployments/${_network}/${_name}`;
}

export function existsDeployedContract(_network: string, _name: string) {
  return existsSync(getDeploymentAddressPath(_network, _name));
}

export function setContractAddress(
  _network: string,
  _name: string,
  _address: string
) {
  writeFileSync(`deployments/${_network}/${_name}`, _address);
}

export function getSaleTemplateKey(_network: string): string {
  return readFileSync(`deployments/${_network}/${saleTemplateName}`).toString();
}

export function setSaleTemplateKey(_network: string, _saleTemplateKey: string) {
  writeFileSync(
    `deployments/${_network}/${saleTemplateName}`,
    _saleTemplateKey
  );
}

export async function deploy(contractName: string, opts: Options) {
  const foundation: SignerWithAddress = await getFoundation();

  if (!opts.from) opts.from = foundation;
  if (!opts.signer) opts.signer = opts.from;
  if (!opts.ABI) opts.ABI = genABI(contractName);
  if (!opts.args) opts.args = [];
  if (!opts.linkings) opts.linkings = [];
  if (!opts.log) opts.log = false;

  const _Factory = await opts.getContractFactory(contractName, {
    signer: opts.signer,
  });

  const _Contract: Contract = await _Factory.deploy(...opts.args);
  await _Contract.deployed();
  if (opts.log)
    console.log(
      `${contractName} is deployed as ${
        _Contract.address
      } by ${await opts.signer.getAddress()}`
    );
  writeFileSync(
    `deployments/${hre.network.name}/${contractName}`,
    _Contract.address
  );
  return _Contract;
}
