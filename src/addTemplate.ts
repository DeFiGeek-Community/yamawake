require('dotenv').config();
import chalk from 'chalk';
import { Contract, utils } from 'ethers';
import { genABI } from '../src/genABI';
import {
    getFoundation,
    extractEmbeddedFactoryAddress,
} from '../src/deployUtil';

export async function addTemplate(templateName: string, deployedFactoryAddress: string, deployedTemplateAddress: string):Promise<string>{
    /*
        1. Instanciate the deployed factory and template.
    */
    const foundation = await getFoundation();
    const Factory = (new Contract(deployedFactoryAddress, genABI('FactoryV1'), foundation));
    const Template = (new Contract(deployedTemplateAddress, genABI(templateName), foundation));

    /*
        2. consistency check between the embedded factory addr in the template and the on-chain factory itself.
    */
    const factoryAddressFromFile = extractEmbeddedFactoryAddress(templateName);
    if(factoryAddressFromFile !== deployedFactoryAddress) {
        throw new Error(`factoryAddressFromFile=${factoryAddressFromFile} is not equal to deployedFactoryAddress=${deployedFactoryAddress}`);
    }
    const upstreamEmbeddedFactoryAddress = await Template.factory();
    if(upstreamEmbeddedFactoryAddress !== deployedFactoryAddress) {
        throw new Error(`upstreamEmbeddedFactoryAddress=${upstreamEmbeddedFactoryAddress} is not equal to deployedFactoryAddress=${deployedFactoryAddress}`);
    }

    /*
        3. Finding unique name
    */

    const name = utils.formatBytes32String(`SaleTemplateV1`);

    /*
        4. Register the template to the Factory.
    */
    console.log(`"mapping(${name} => ${Template.address})" is being registered to the Factory... (Factory.owner = ${(foundation).address})`);
    let tx = await Factory.connect(foundation).addTemplate(name, Template.address, {gasLimit: 10000000})
    await tx.wait();

    /*
        5. Show result.
    */
    console.log(chalk.green.bgBlack.bold(
        `[Finished] addTemplate :: ${name}=${await Factory.templates(name)} is registered to factory=${Factory.address}\n\n`
    ));

    /*
        Return the key of template;
    */
    return name;
}
