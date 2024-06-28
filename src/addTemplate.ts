import chalk from "chalk";
import { ethers } from "hardhat";
import { getFoundation, getContractAddress } from "../src/deployUtil";

export async function addTemplate(
  networkName: string,
  templateName: string,
  deployedFactoryAddress: string,
  deployedTemplateAddress: string
): Promise<string> {
  /*
        1. Instanciate the deployed factory and template.
    */
  const foundation = await getFoundation();

  const Factory = await ethers.getContractAt(
    "Factory",
    deployedFactoryAddress,
    foundation
  );
  const Template = await ethers.getContractAt(
    templateName,
    deployedTemplateAddress,
    foundation
  );

  /*
        2. consistency check between the embedded factory addr in the template and the on-chain factory itself.
    */
  const factoryAddressFromFile = getContractAddress(networkName, "Factory");
  if (factoryAddressFromFile !== deployedFactoryAddress) {
    throw new Error(
      `factoryAddressFromFile=${factoryAddressFromFile} is not equal to deployedFactoryAddress=${deployedFactoryAddress}`
    );
  }

  /*
        3. Finding unique name
    */

  const name = ethers.encodeBytes32String(templateName);
  const initializeSignature =
    Template.interface.getFunction("initialize")!.selector;
  const transferSignature =
    Template.interface.getFunction("initializeTransfer")!.selector;
  /*
        4. Register the template to the Factory.
    */
  console.log(
    `"mapping(${name} => ${Template.address})" is being registered to the Factory... (Factory.owner = ${foundation.address})`
  );
  let tx = await Factory.connect(foundation).addTemplate(
    name,
    await Template.getAddress(),
    initializeSignature,
    transferSignature
  );
  await tx.wait();

  /*
        5. Show result.
    */
  console.log(
    chalk.green.bgBlack.bold(
      `[Finished] addTemplate :: ${name}=${await Factory.templates(
        name
      )} is registered to factory=${await Factory.getAddress()}\n\n`
    )
  );

  /*
        Return the key of template;
    */
  return name;
}
