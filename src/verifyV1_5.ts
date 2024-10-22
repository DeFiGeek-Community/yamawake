import { network, run, ethers } from "hardhat";
import { readFileSync } from "fs";

async function main() {
  const basePath = `deployments/${network.name}/`;

  const factoryAddress = readFileSync(basePath + "Factory").toString();
  const ymwkAddress = readFileSync(basePath + "YMWK").toString();
  const distributorAddress = readFileSync(basePath + "Distributor").toString();

  // VotingEscrow
  const votingEscrowAddress = readFileSync(
    basePath + "VotingEscrow"
  ).toString();
  await run(`verify:verify`, {
    address: votingEscrowAddress,
    constructorArguments: [
      ymwkAddress,
      "Voting-escrowed Yamawake",
      "veYMWK",
      "v1",
    ],
  });

  // FeeDistributor
  const feeDistributorAddress = readFileSync(
    basePath + "FeeDistributor"
  ).toString();
  const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
  const feeDistributor = FeeDistributor.attach(feeDistributorAddress);
  const startTime = (
    await feeDistributor.startTime(ethers.ZeroAddress)
  ).toNumber();
  await run(`verify:verify`, {
    address: feeDistributorAddress,
    constructorArguments: [votingEscrowAddress, factoryAddress, startTime],
  });

  // GaugeControllerV1
  const implGaugeControllerAddress = readFileSync(
    basePath + "ImplGaugeControllerV1"
  ).toString();
  await run(`verify:verify`, {
    address: implGaugeControllerAddress,
    constructorArguments: [],
  });
  const gaugeControllerAddress = readFileSync(
    basePath + "GaugeControllerV1"
  ).toString();
  await run(`verify:verify`, {
    address: gaugeControllerAddress,
    constructorArguments: [votingEscrowAddress, ymwkAddress],
  });

  // Minter
  const minterAddress = readFileSync(basePath + "Minter").toString();
  await run(`verify:verify`, {
    address: minterAddress,
    constructorArguments: [ymwkAddress, gaugeControllerAddress],
  });

  // Gauge
  const INFLATION_DELAY = 86400 * 365;
  const ymwk = (await ethers.getContractFactory("YMWK")).attach(ymwkAddress);
  const tokenInflationStarts = (await ymwk.startEpochTime()).add(
    INFLATION_DELAY
  );
  const gaugeAddress = readFileSync(basePath + "Gauge").toString();
  await run(`verify:verify`, {
    address: gaugeAddress,
    constructorArguments: [minterAddress, tokenInflationStarts],
  });

  // TemplateV1.5
  const templateAddress = readFileSync(basePath + "TemplateV1_5").toString();
  await run(`verify:verify`, {
    address: templateAddress,
    constructorArguments: [
      factoryAddress,
      feeDistributorAddress,
      distributorAddress,
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
