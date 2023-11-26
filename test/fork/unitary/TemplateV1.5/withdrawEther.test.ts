import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  time,
  takeSnapshot,
  SnapshotRestorer,
} from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { deploySaleTemplateV1_5, sendEther } from "../../../scenarioHelper";

const DAY = 86400;
const WEEK = DAY * 7;
const TEMPLATE_NAME = ethers.utils.formatBytes32String("TemplateV1.5");

describe("Template V1.5", () => {
  let alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    dan: SignerWithAddress;
  let feeDistributor: Contract;
  let votingEscrow: Contract;
  let factory: Contract;
  let token: Contract;
  let coinA: Contract;
  let snapshot: SnapshotRestorer;

  beforeEach(async function () {
    snapshot = await takeSnapshot();
    [alice, bob, charlie, dan] = await ethers.getSigners();

    const Distributor = await ethers.getContractFactory("FeeDistributor");
    const YMWK = await ethers.getContractFactory("YMWK");
    const Token = await ethers.getContractFactory("MockToken");
    const VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    const Factory = await ethers.getContractFactory("Factory");

    token = await YMWK.deploy();
    await token.deployed();

    coinA = await Token.deploy("Coin A", "USDA", 18);
    await coinA.deployed();

    votingEscrow = await VotingEscrow.deploy(
      token.address,
      "Voting-escrowed token",
      "vetoken",
      "v1"
    );
    await votingEscrow.deployed();

    factory = await Factory.deploy();
    await factory.deployed();

    feeDistributor = await Distributor.deploy(
      votingEscrow.address,
      factory.address,
      await time.latest(),
      alice.address,
      alice.address
    );
    await feeDistributor.deployed();
  });
  afterEach(async () => {
    await snapshot.restore();
  });

  describe("test_fee_distribution", () => {
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
      const auctionAmount = ethers.utils.parseEther("100");
      await coinA._mintForTesting(alice.address, auctionAmount);
      await coinA.approve(factory.address, auctionAmount);
      // TODO
      await feeDistributor.toggleAllowCheckpointToken();

      /*
      1) テンプレートV1.5をデプロイし、factoryに登録後、オークションを開催する
      */
      let { auction, feePool, distributor } = await deploySaleTemplateV1_5(
        factory,
        feeDistributor,
        token,
        coinA.address,
        auctionAmount,
        Math.floor(new Date().getTime() / 1000) + DAY,
        DAY,
        "0",
        alice
      );

      /*
      2) オークション開始まで時間を進め、Bobが入札し、オークション終了まで時間を進める
      */
      await time.increase(DAY);
      await sendEther(auction.address, "100", bob);
      await time.increase(DAY);

      /*
      3) Aliceが売上を回収した後下記を確認
        a) FeeDistributorに売上の1%から開発者取り分を引いた額が送金されていること
        b) FeeDistributorのlastTokenTimeが引き出しトランザクションのブロックタイムと一致すること
      */
      await expect(
        auction.connect(alice).withdrawRaisedETH()
      ).to.changeEtherBalances(
        [
          alice.address,
          auction.address,
          feePool.address,
          feeDistributor.address,
        ],
        [
          ethers.utils.parseEther("99"),
          ethers.utils.parseEther("-100"),
          ethers.utils.parseEther("0.1"),
          ethers.utils.parseEther("0.9"),
        ]
      );
    });
  });
});
