import { ethers } from "hardhat";
import { expect } from "chai";

describe("ccip test", function () {
  it("show configs", async function () {
    const localSimulatorFactory =
      await ethers.getContractFactory("CCIPLocalSimulator");
    const localSimulator = await localSimulatorFactory.deploy();

    const config: {
      chainSelector_: bigint;
      sourceRouter_: string;
      destinationRouter_: string;
      wrappedNative_: string;
      linkToken_: string;
      ccipBnM_: string;
      ccipLnM_: string;
    } = await localSimulator.configuration();

    const CCIPSender_UnsafeFactory =
      await ethers.getContractFactory("CCIPSender_Unsafe");
    const CCIPSender_Unsafe = await CCIPSender_UnsafeFactory.deploy(
      config.linkToken_,
      config.sourceRouter_,
    );

    console.log("Deployed CCIPSender_Unsafe to: ", CCIPSender_Unsafe.address);

    const CCIPReceiver_UnsafeFactory = await ethers.getContractFactory(
      "CCIPReceiver_Unsafe",
    );
    const CCIPReceiver_Unsafe = await CCIPReceiver_UnsafeFactory.deploy(
      config.destinationRouter_,
    );

    console.log(
      "Deployed CCIPReceiver_Unsafe to: ",
      CCIPReceiver_Unsafe.address,
    );

    console.log("-------------------------------------------");

    const ccipBnMFactory = await ethers.getContractFactory(
      "BurnMintERC677Helper",
    );
    const ccipBnM = ccipBnMFactory.attach(config.ccipBnM_);

    await ccipBnM.drip(CCIPSender_Unsafe.address);

    const linkTokenFactory = await ethers.getContractFactory("SampleToken");
    const linkToken = linkTokenFactory.attach(config.linkToken_);

    const textToSend = `Hello World`;
    const amountToSend = 100;

    console.log(
      `Link Balance of CCIPSender_Unsafe before: `,
      await linkToken.balanceOf(CCIPSender_Unsafe.address),
    );
    console.log(
      `Link Balance of CCIPReceiver_Unsafe before: `,
      await linkToken.balanceOf(CCIPReceiver_Unsafe.address),
    );

    console.log(
      `Balance of CCIPSender_Unsafe before: `,
      await ccipBnM.balanceOf(CCIPSender_Unsafe.address),
    );
    console.log(
      `Balance of CCIPReceiver_Unsafe before: `,
      await ccipBnM.balanceOf(CCIPReceiver_Unsafe.address),
    );
    console.log("-------------------------------------------");

    const tx = await CCIPSender_Unsafe.send(
      CCIPReceiver_Unsafe.address,
      textToSend,
      config.chainSelector_,
      config.ccipBnM_,
      amountToSend,
    );
    console.log("Transaction hash: ", tx.hash);

    console.log("-------------------------------------------");

    console.log(
      `Link Balance of CCIPSender_Unsafe after: `,
      await linkToken.balanceOf(CCIPSender_Unsafe.address),
    );
    console.log(
      `Link Balance of CCIPReceiver_Unsafe after: `,
      await linkToken.balanceOf(CCIPReceiver_Unsafe.address),
    );

    console.log(
      `Balance of CCIPSender_Unsafe after: `,
      await ccipBnM.balanceOf(CCIPSender_Unsafe.address),
    );
    console.log(
      `Balance of CCIPReceiver_Unsafe after: `,
      await ccipBnM.balanceOf(CCIPReceiver_Unsafe.address),
    );

    expect(await ccipBnM.balanceOf(CCIPReceiver_Unsafe.address)).to.be.eq(100);

    console.log("-------------------------------------------");
    const received = await CCIPReceiver_Unsafe.text();
    console.log(`Received:`, received);

    expect(received).to.be.eq(textToSend);
  });
});
