import { network, run } from "hardhat";
import { readFileSync } from "fs";

async function main() {
  const basePath = `deployments/${network.name}/`;

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

  // CCIP Router
  const routerAddress = readFileSync(basePath + "Router").toString();
  let ccipDistributorAddress;

  if (network.tags.receiver) {
    // YMWK
    const ymwkAddress = readFileSync(basePath + "YMWK").toString();
    await run(`verify:verify`, {
      address: ymwkAddress,
    });

    // Distributor
    const distributorAddress = readFileSync(
      basePath + "Distributor"
    ).toString();
    await run(`verify:verify`, {
      address: distributorAddress,
      constructorArguments: [factoryAddress, ymwkAddress],
    });

    // TemplateYMWKWithdraw
    const templateYMWKWithdraw = readFileSync(
      basePath + "TemplateYMWKWithdraw"
    ).toString();
    await run(`verify:verify`, {
      address: templateYMWKWithdraw,
      constructorArguments: [
        factoryAddress,
        feePoolAddress,
        distributorAddress,
      ],
    });

    // CCIP DistributorReceiver
    ccipDistributorAddress = readFileSync(
      basePath + "DistributorReceiver"
    ).toString();
    await run(`verify:verify`, {
      address: ccipDistributorAddress,
      constructorArguments: [factoryAddress, ymwkAddress, routerAddress],
    });
  } else if (network.tags.sender) {
    // CCIP DistributorSender
    ccipDistributorAddress = readFileSync(
      basePath + "DistributorSender"
    ).toString();
    await run(`verify:verify`, {
      address: ccipDistributorAddress,
      constructorArguments: [factoryAddress, routerAddress],
    });
  }

  if (ccipDistributorAddress) {
    // TemplateV1
    const templateAddress = readFileSync(basePath + "TemplateV1").toString();
    await run(`verify:verify`, {
      address: templateAddress,
      constructorArguments: [
        factoryAddress,
        feePoolAddress,
        ccipDistributorAddress,
      ],
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
