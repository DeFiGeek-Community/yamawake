import { expect } from "chai";
import { ethers } from "hardhat";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { deploySaleTemplateV1_5, sendEther } from "../../../scenarioHelper";
import {
  Factory,
  FeeDistributor,
  MockToken,
  VotingEscrow,
  YMWK,
} from "../../../../typechain-types";

describe("Template V1.5", () => {
  const DAY = 86400;

  let alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    dan: SignerWithAddress;
  let feeDistributor: FeeDistributor;
  let votingEscrow: VotingEscrow;
  let factory: Factory;
  let token: YMWK;
  let coinA: MockToken;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob, charlie, dan] = await ethers.getSigners();

    const FeeDistributor = await ethers.getContractFactory(
      "FeeDistributor",
      alice
    );
    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const Factory = await ethers.getContractFactory("Factory");

    token = await YMWK.deploy();
    await token.waitForDeployment();

    coinA = await Token.deploy("Coin A", "USDA", 18);
    await coinA.waitForDeployment();

    votingEscrow = await VotingEscrow.deploy(
      token.target,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.waitForDeployment();

    factory = await Factory.deploy();
    await factory.waitForDeployment();

    feeDistributor = await FeeDistributor.deploy(
      votingEscrow.target,
      factory.target,
      await time.latest()
    );
    await feeDistributor.waitForDeployment();
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  /*
  【手順】
  テンプレートV1.5にてオークションを開催、入札、成功状態で完了し、オーナーが売上を回収する。

  【確認事項】
  a) 売上回収後にFeeDistributorに売上の1%から開発者取り分を引いた額が送金されていること
  b) FeeDistributorのlastTokenTimeが引き出しトランザクションのブロックタイムと一致すること
  */
  it(`test_token_deposited_after`, async function () {
    /*
      0) 必要なオークショントークンをAliceに付与すし、factoryに対して必要金額をApproveする
    */
    const auctionAmount = ethers.parseEther("100");
    await coinA._mintForTesting(alice.address, auctionAmount);
    await coinA.approve(factory.target, auctionAmount);

    /*
      1) テンプレートV1.5をデプロイし、factoryに登録後、オークションを開催する
    */
    let { auction, distributor } = await deploySaleTemplateV1_5(
      factory,
      feeDistributor,
      token,
      String(coinA.target),
      auctionAmount,
      (await time.latest()) + DAY,
      DAY,
      "0",
      alice
    );

    /*
      2) オークション開始まで時間を進め、Bobが入札し、オークション終了まで時間を進める
    */
    await time.increase(DAY);
    await sendEther(auction.target, "100", bob);
    await time.increase(DAY);

    /*
      3) Aliceが売上を回収した後下記を確認
      a) FeeDistributorに売上の1%が送金されていること
      b) FeeDistributorのlastTokenTimeが引き出しトランザクションのブロックタイムと一致すること
    */
    await expect(
      auction.connect(alice).withdrawRaisedETH()
    ).to.changeEtherBalances(
      [alice.address, auction.target, feeDistributor.target],
      [
        ethers.parseEther("99"),
        ethers.parseEther("-100"),
        ethers.parseEther("1"),
      ]
    );
    expect(await feeDistributor.lastTokenTime(ethers.ZeroAddress)).to.be.eq(
      await time.latest()
    );
  });
});
