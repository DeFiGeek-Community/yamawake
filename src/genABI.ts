import { readFileSync } from 'fs';
import { utils } from 'ethers';

export function genABI(filename: string){
    return new utils.Interface(
        JSON.parse(
            readFileSync(`artifacts/contracts/${filename}.sol/${filename}.json`)
            .toString()
        ).abi
    )
}
