# Yamawake

## 概要

パーミッションレスオークションプラットフォーム

任意のトークンを、用意されたテンプレートに定められたオークション形式で販売することができる

## 構成

### V1

#### [Distributor](./Distributor/index.md)

#### [Factory](./Factory/index.md)

#### [Template](./Template/index.md)

#### [FeePool](./FeePool/index.md)

#### [Yamawake DAO Token](./YamawakeToken/index.md)

### V1.5

#### [VotingEscrow](./VotingEscrow/index.md)

YMWK トークンをロックし、移転不可のveYMWK トークンを発行する。

#### [FeeDistributorV1](./FeeDistributorV1/index.md)

オークションの手数料をveYMWKホルダーに報酬として分配する。

#### [GaugeControllerV1](./GaugeControllerV1/index.md)

GaugeごとのWeightの管理をする。

#### [RewardGaugeV1](./RewardGaugeV1/index.md)

veYMWKホルダーに対するYMWKトークン報酬を計算・保持する。

#### [MinterV1](./MinterV1/index.md)

ユーザからミントのリクエストを受け、ミント可能額をGaugeから取得し、YMWKトークンをミントする。

#### [TemplateV1.5](./Template/V1.5/index.md)

IBAO(Initial Bulk Auction Offering)テンプレート

## ユースケース

### Voting Escrow

[VotingEscrow ユースケース図](./VotingEscrow/usecase.md)

### Fee Distribution

[FeeDistributor ユースケース図](./FeeDistributorV1/usecase.md)
