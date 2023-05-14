import { network, run } from "hardhat";
import { readFileSync } from 'fs';
import { getFoundation } from "./deployUtil";
async function main() {
    const basePath = `deployments/${network.name}/`;
    const foundation = await getFoundation();

    // Factory
    const factoryAddress = readFileSync(basePath + 'FactoryV1').toString();
    await run(`verify:verify`, {
        address: factoryAddress,
    });

    // BulkSaleV1
    const saleAddress = readFileSync(basePath + 'SaleTemplateV1').toString();
    await run(`verify:verify`, {
        address: saleAddress,
    });

    // SampleToken
    // const sampleAddress = readFileSync(basePath + 'SampleToken').toString();
    // await run(`verify:verify`, {
    //     address: sampleAddress,
    //     constructorArguments: [parseEther('115792089237316195423570985008687907853269984665640564039457')]
    // });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});