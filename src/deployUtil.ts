import { readFileSync, writeFileSync, existsSync } from "fs";
import { Contract } from "ethers";
import { genABI } from "./genABI";
import { ethers, network, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

type Options = {
  from?: SignerWithAddress | undefined;
  signer?: SignerWithAddress | undefined;
  ABI?: any | undefined;
  args?: Array<any> | undefined;
  linkings?: Array<string> | undefined;
  log?: boolean | undefined;
  getContractFactory: any;
};

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
  await _Contract.waitForDeployment();
  if (opts.log)
    console.log(
      `${contractName} is deployed as ${_Contract.target} by ${opts.signer.address}`
    );
  writeFileSync(
    `deployments/${network.name}/${contractName}`,
    _Contract.target.toString()
  );
  return _Contract;
}

export async function deployProxy(contractName: string, opts: Options) {
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

  const _Contract: Contract = await upgrades.deployProxy(_Factory, opts.args);
  await _Contract.waitForDeployment();
  const implAddress = await upgrades.erc1967.getImplementationAddress(
    String(_Contract.target)
  );
  if (opts.log)
    console.log(
      `${contractName} is deployed as ${
        _Contract.target
      } by ${await opts.signer.getAddress()}`
    );
  writeFileSync(
    `deployments/${network.name}/${contractName}`,
    String(_Contract.target)
  );
  writeFileSync(`deployments/${network.name}/Impl${contractName}`, implAddress);
  return _Contract;
}
