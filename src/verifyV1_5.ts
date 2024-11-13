import { network, run } from "hardhat";
import { readFileSync } from "fs";

async function main() {
  const basePath = `deployments/${network.name}/`;

  const factoryAddress = readFileSync(basePath + "Factory").toString();
  const ymwkAddress = readFileSync(basePath + "YMWK").toString();
  const distributorAddress = readFileSync(
    basePath + "DistributorReceiver"
  ).toString();

  // VotingEscrow
  const votingEscrowAddress = readFileSync(
    basePath + "VotingEscrow"
  ).toString();
  try {
    console.log(`[INFO] Verifying VotingEscrow...`);
    await run(`verify:verify`, {
      address: votingEscrowAddress,
      constructorArguments: [ymwkAddress, "Voting-escrowed Yamawake", "veYMWK"],
    });
  } catch (e) {
    console.log(`[ERROR] ${e}`);
  }

  // FeeDistributor
  const feeDistributorAddress = readFileSync(
    basePath + "FeeDistributorProxy"
  ).toString();

  try {
    console.log(`[INFO] Verifying FeeDistributor...`);
    await run(`verify:verify`, {
      address: feeDistributorAddress,
    });
  } catch (e) {
    console.log(`[ERROR] ${e}`);
  }

  // GaugeController
  const gaugeControllerAddress = readFileSync(
    basePath + "GaugeControllerProxy"
  ).toString();

  try {
    console.log(`[INFO] Verifying GaugeController...`);
    await run(`verify:verify`, {
      address: gaugeControllerAddress,
    });
  } catch (e) {
    console.log(`[ERROR] ${e}`);
  }

  // Minter
  const minterAddress = readFileSync(basePath + "MinterProxy").toString();
  try {
    console.log(`[INFO] Verifying Minter...`);
    await run(`verify:verify`, {
      address: minterAddress,
    });
  } catch (e) {
    console.log(`[ERROR] ${e}`);
  }

  // Gauge
  const gaugeAddress = readFileSync(basePath + "GaugeProxy").toString();
  try {
    console.log(`[INFO] Verifying Gauge...`);
    await run(`verify:verify`, {
      address: gaugeAddress,
    });
  } catch (e) {
    console.log(`[ERROR] ${e}`);
  }

  // TemplateV1.5
  const templateAddress = readFileSync(basePath + "TemplateV1_5").toString();

  try {
    console.log(`[INFO] Verifying TemplateV1.5...`);
    await run(`verify:verify`, {
      address: templateAddress,
      constructorArguments: [
        factoryAddress,
        feeDistributorAddress,
        distributorAddress,
      ],
    });
  } catch (e) {
    console.log(`[ERROR] ${e}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
