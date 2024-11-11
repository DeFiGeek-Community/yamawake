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

### V1.5

#### [FeeDistributorV1](./FeeDistributorV1/index.md)

オークションの手数料をveYMWKホルダーに報酬として分配する

#### [GaugeControllerV1](./GaugeControllerV1/index.md)

CurveのGaugeControllerのフォーク。GaugeごとのWeightの管理をする

#### [GaugeV1](./GaugeV1/index.md)

veYMWKホルダーに対するYMWKトークン報酬を計算・保持する。

#### [MinterV1](./MinterV1/index.md)

ユーザからミントのリクエストを受け、ミント可能額をGaugeから取得し、YMWKトークンをミントする

#### [TemplateV1.5](./Template/V1.5/index.md)

IBAO(Initial Bulk Auction Offering)テンプレート
