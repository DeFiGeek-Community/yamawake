import { network, run } from "hardhat";
import { readFileSync } from "fs";
import { getFoundation } from "./deployUtil";
async function main() {
  const basePath = `deployments/${network.name}/`;
  const foundation = await getFoundation();

  // Factory
  const factoryAddress = readFileSync(basePath + "Factory").toString();
  await run(`verify:verify`, {
    address: factoryAddress,
  });

  // FeePool
  const feePoolAddress = readFileSync(basePath + "FeePool").toString();
  await run(`verify:verify`, {
    address: feePoolAddress,
  });

  // YMWK
  const ymwkAddress = readFileSync(basePath + "YMWK").toString();
  await run(`verify:verify`, {
    address: ymwkAddress,
  });

  // Distributor
  const distributorAddress = readFileSync(basePath + "Distributor").toString();
  await run(`verify:verify`, {
    address: distributorAddress,
    constructorArguments: [factoryAddress, ymwkAddress],
  });

  // TemplateV1
  const templateAddress = readFileSync(basePath + "TemplateV1").toString();
  await run(`verify:verify`, {
    address: templateAddress,
    constructorArguments: [factoryAddress, feePoolAddress, distributorAddress],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
