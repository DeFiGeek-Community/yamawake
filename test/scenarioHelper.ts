const { ethers } = require("hardhat");
import { BigNumber } from "ethers";
import { encode } from "./helper";

const saleTemplateName = ethers.utils.formatBytes32String("sale")

export function getTokenAbiArgs(templateName:string, {
    initialSupply,
    name,
    symbol,
    owner
}:{
    initialSupply: BigNumber,
    name: string,
    symbol: string,
    owner: string
}){
    let types;
    if(!templateName || templateName.length==0) throw new Error(`scenarioHelper::getTokenAbiArgs() -> templateName is empty.`);
    if(templateName.indexOf('OwnableToken') == 0){
        types = ["uint", "string", "string", "address"]
    } else {
        console.trace(`${templateName} is not planned yet. Add your typedef for abi here.`);
        throw 1;
    }
    return encode(
        types,
        [initialSupply, name, symbol, owner]
    );

}

export function getSaleAbiArgs(templateName:string, {
    token,
    owner,
    start,
    eventDuration,
    allocatedAmount,
    minEtherTarget,
}:{
    token: string,
    owner: string,
    start: number/* unixtime in sec (not milisec) */,
    eventDuration: number /* in sec */,
    allocatedAmount: BigNumber,
    minEtherTarget: BigNumber,
}){
    let types;
    if(!templateName || templateName.length==0) throw new Error(`scenarioHelper::getBulksaleAbiArgs() -> templateName is empty.`);
    if(templateName.indexOf(saleTemplateName) == 0){
        types = ["address", "address", "uint", "uint", "uint", "uint"];
    } else if(templateName == 'ERC20CRV.vy') {// for revert test
        types = ["address", "uint", "uint", "uint", "uint", "uint", "uint", 'address', 'uint'];
    } else {
        console.trace(`${templateName} is not planned yet. Add your typedef for abi here.`);
        throw 1;
    }

    return encode(
        types,
        [token, owner, start, eventDuration, allocatedAmount, minEtherTarget]
    );
}


export async function sendERC20(erc20contract:any, to:any, amountStr:string, signer: any){
    let sendResult = await (await signer.sendTransaction({
        to: to,
        value: ethers.utils.parseEther(amountStr)
    })).wait();
}
export async function sendEther(to:any, amountStr:string, signer: any){
    let sendResult = await (await signer.sendTransaction({
        to: to,
        value: ethers.utils.parseEther(amountStr)
    })).wait();
}

export async function timeTravel(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}