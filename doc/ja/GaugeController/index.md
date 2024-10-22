# GaugeController

## 概要

Curveの[GaugeController](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/GaugeController.vy)のフォーク。GaugeごとのWeightの管理をする

openzeppelinのUUPSUpgradeableを継承する

## 機能

## 定数

- MULTIPLIER: constant(uint256) = 10 \*\* 18
  - 丸め誤差回避用の定数

## プロパティ

- address public admin
  - 管理者のアドレスを保持する
- address public futureAdmin

  - 次期管理者のアドレスを保持する

- address public token
  - 排出を制御する対象のトークンアドレスを保持する
- address public votingEscrow
  - VotingEscrowコントラクトのアドレスを保持する

### Gauge parameters

- int128 public nGaugeTypes
  - Gauge Typeの数を保持する。V1.5では1つのみ
- int128 public nGauges
  - Gaugeの数を保持する。V1.5では1つのみ
- mapping(int128 => string) public gaugeTypeNames

  - Gauge Typeの名称を保持する。V1.5ではveYMWKのみ

- address[1000000000] public gauges

  - Gaugeのアドレスを保持する。V1.5では1つのみ

- mapping(address => int128) public gaugeTypes\_

  - GaugeのTypeを保持する

## 関数

### initialize(address token\_, address votingEscrow\_) public initializer

UUPSUpgradeableのイニシャライザ

- adminを設定する
- tokenを設定する
- votingEscrowを設定する
- veYMWK gaugeTypeを設定する

### function \_authorizeUpgrade(address newImplementation) internal virtual override onlyAdmin

UUPSUpgradeableから継承。アップグレードの実行可能ユーザをadminに制限する

### commitTransferOwnership(addr address)

次期管理者アドレスを設定

- external
- 条件
  - 管理者のみ

### applyTransferOwnership()

管理者アドレスに次期管理者アドレスを設定

- external
- 条件
  - 管理者のみ

### gaugeTypes(address: addr\_) returns int128

GaugeのTypeを取得する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
- 戻り値
  - GaugeのType

### addGauge(address addr\_, int128, uint256)

Gaugeを追加する。V1.5では1つのみ追加可能

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
  - gaugeType\_
    - V1.5では使用しない
  - weight\_
    - V1.5では使用しない
- 条件
  - 管理者のみ
  - 1つのみ

### checkpoint()

V1.5では何もしない

- external

### checkpointGauge(address addr\_)

V1.5では何もしない

- external
- 引数
  - addr\_
    - V1.5では使用しない

### gaugeRelativeWeight(address addr\_, uint256 time\_) returns uint256

V1.5では固定値の1e18を返却する

- external
- 引数
  - addr\_
    - V1.5では使用しない
  - time\_
    - V1.5では使用しない
- 戻り値
  - 固定値 1e18
