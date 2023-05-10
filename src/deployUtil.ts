import {
    readFileSync,
    writeFileSync,
    existsSync,
    unlinkSync
  } from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    Contract
  } from "ethers";
import { genABI } from './genABI';
import { ethers } from "hardhat";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
const hre:HardhatRuntimeEnvironment = require("hardhat")
const addressExp = /address public constant factory =[ \r\n|\n|\r]* *address\(0x([0-9a-fA-F]{40})\);/;
const saleTemplateName = ".saleTemplateName"
const EMBEDDED_MODE_FILE = '.embeddedMode';

type Options = {
    from?: SignerWithAddress|undefined;
    signer?: SignerWithAddress|undefined;
    ABI?:any|undefined;
    args?:Array<any>|undefined;
    linkings?:Array<string>|undefined;
    log?: boolean|undefined;
    getContractFactory: any;
  }

export function goToEmbededMode(network: string){
    writeFileSync(`deployments/${network}/${EMBEDDED_MODE_FILE}`, "");
    console.log(`\n${EMBEDDED_MODE_FILE} is created. Factory Address is from ${getLocalFactoryAddress()} to ${extractEmbeddedFactoryAddress("BulksaleV1")}. Now this command is embedded mode.\n`);
}

export function isEmbeddedMode(network: string){
    return existsSync(`deployments/${network}/${EMBEDDED_MODE_FILE}`);
}

export function backToInitMode(network: string){
  const localAddress = getLocalFactoryAddress();
  try {
    unlinkSync(`deployments/${network}/${EMBEDDED_MODE_FILE}`);
  } catch (e: any) {
    console.trace(e.message);   
  }
  console.log(`\n${EMBEDDED_MODE_FILE} is deleted. Now this command is initial mode. ${localAddress} is on the contract-hard-coded-value.\n`);
}

export function hardcodeFactoryAddress(filename: string, address: string){
    let path = `contracts/${filename}.sol`;
    let tmp = readFileSync(path).toString().replace(
      addressExp,
      `address public constant factory = address(${address});`
    );
    writeFileSync(path, tmp);
  }

 export function recoverFactoryAddress(filename: string){
    let path = `contracts/${filename}.sol`;
    const localAddress = getLocalFactoryAddress();
    let tmp = readFileSync(path).toString().replace(
      addressExp,
      `address public constant factory = address(${localAddress});`
    );
    writeFileSync(path, tmp);
    console.log(`deployUtil.recoverFactoryAddress() ... Embedded address is back to ${localAddress} for ${filename}`)
  }

export function getLocalFactoryAddress() {
    return process.env.LOCAL_FACTORY_ADDERSS;
}

export function extractEmbeddedFactoryAddress(filename: string){
  let path = `contracts/${filename}.sol`;
  let group = readFileSync(path).toString().match(addressExp);
  if (group === null) return null;
  return `0x${group[1]}`;
}

export async function getFoundation(): Promise<SignerWithAddress> {
    const accounts = await ethers.getSigners();
    return accounts[0];
}

export function getSaleTemplateKey(_network: string):string{
  return readFileSync(`deployments/${_network}/${saleTemplateName}`).toString();
}

export function setSaleTemplateKey(_network: string, _saleTemplateKey:string){
  writeFileSync(`deployments/${_network}/${saleTemplateName}`, _saleTemplateKey);
}

export async function deploy(contractName:string, opts:Options){
    const foundation:SignerWithAddress = await getFoundation();

    if(!opts.from) opts.from = foundation;
    if(!opts.signer) opts.signer = opts.from;
    if(!opts.ABI) opts.ABI = genABI(contractName);
    if(!opts.args) opts.args = [];
    if(!opts.linkings) opts.linkings = [];
    if(!opts.log) opts.log = false;

    const _Factory = await opts.getContractFactory(contractName, {
      signer: opts.signer
    });

    const _Contract:Contract = await _Factory.deploy(...opts.args);
    await _Contract.deployed();
    if(opts.log) console.log(`${contractName} is deployed as ${_Contract.address} by ${await opts.signer.getAddress()}`);
    writeFileSync(`deployments/${hre.network.name}/${contractName}`, _Contract.address);
    return _Contract;
}