import { network, run } from "hardhat";
import { parseEther } from 'ethers/lib/utils';
import { readFileSync } from 'fs';
import { getFoundation } from "./deployUtil";
async function main() {
    const basePath = `deployments/${network.name}/`;
    const foundation = await getFoundation();

    // Factory
    const factoryAddress = readFileSync(basePath + 'Factory').toString();
    await run(`verify:verify`, {
        address: factoryAddress,
        constructorArguments: [foundation.address],
    });

    // BulkSaleV1
    const saleAddress = readFileSync(basePath + 'BulkSaleV1').toString();
    await run(`verify:verify`, {
        address: saleAddress,
    });

    // OwnableToken
    const ownableAddress = readFileSync(basePath + 'OwnableToken').toString();
    await run(`verify:verify`, {
        address: ownableAddress,
    });

    // SampleToken
    const sampleAddress = readFileSync(basePath + 'SampleToken').toString();
    await run(`verify:verify`, {
        address: sampleAddress,
        constructorArguments: [parseEther('115792089237316195423570985008687907853269984665640564039457')]
    });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});