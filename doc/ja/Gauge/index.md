# Gauge

## 概要

[veYMWK](../VotingEscrow/index.md)ホルダーに対する[YMWKトークン](../YamawakeToken/index.md)報酬を計算・保持する。

## 機能

### 定数

uint256 public constant WEEK = 604800

### プロパティ

- ymwk(address public immutable)

  - YMWKトークンのアドレスを保持する

- gauge_controller(address public immutable)

  - ゲージコントローラーのアドレスを保持する

- minter(address public immutable)

  - ミンターのアドレスを保持する

- votingEscrow(address public immutable)

  - VotingEscrowのアドレスを保持する

- admin(address public)

  - 管理者アドレスを保持する

- isKilled(bool public)

  - kill状態フラグ

- inflation_params(uint256 public)

  - YMWKのインフレーションレート、次回のインフレーションレート変更タイムスタンプを保持する
  - futureEpochTimeが 40 bit, inflationRateが 216 bit

- integrate_inv_supply(uint256[100000000000000000000000000000] public)

  - veYMWK残高に対するYMWKインフレーション量の割合の履歴を保持する
    - ∫(r(t) \* w(t) / total_ve_balance(t) dt)

- integrateInvSupplyOf(address => uint256 public)

  - ユーザの最後のチェックポイント時の総veYMWK残高を保持する

- integrateCheckpointOf(address => uint256 public)
  - ユーザの最後のチェックポイント時の総veYMWK残高を保持する
- integrateFraction(address => uint256 public)
  - ユーザごとのYMWK報酬の累計を保持する
    - ∫((r(t) \* w(t) / total_ve_balance(t)) user_ve_balance(t) dt)
- timeCursor(uint256 public)
  - ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する
- timeCursorOf(address => uint256 public)
  - ユーザごとの、ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する
- userEpochOf(address => uint256 public)
  - ユーザごとの、ve同期が完了している最後（最新）の履歴のエポック数を保持する
- periodTimestamp(uint256[100000000000000000000000000000] public)
  - チェックポイントごとのタイムスタンプを保持する
- period(int128 public)
  - チェックポイントの履歴数を保持する

### 関数

#### 初期化

- ymwkを設定する
- votingEscrowを設定する
- gaugeControllerを設定する
- minterを設定する
- periodTimestampを設定する
- inflationParamsをymwkから取得し、設定する

#### veYMWK残高に対するYMWKインフレーション量の割合の履歴を更新する

- 最後に同期された時点から20週分に渡りveYMWK残高をVoting Escrowから情報を取得する
- Gauge ControllerからWeightを取得する
- YMWKトークンのインフレーションレートの更新タイムスタンプを跨ぐ場合はYMWKトークンのインフレーションレートと次回のインフレーションレート更新タイムスタンプを更新する
- それぞれの週について、veYMWK残高に対するYMWKインフレーション量の割合を計算し履歴を更新する
- 履歴のタイムスタンプを更新する

#### ユーザごとのYMWK報酬を更新する

- 最後に同期されたユーザの履歴から最大50回分の履歴を取得する
- それぞれの履歴が発生した週について、YMWK報酬を計算し、記録する
- 履歴のタイムスタンプ、エポック数を更新する

#### \_checkpointTotalSupply()

ve履歴を同期する

- internal

#### checkpointTotalSupply()

\_checkpointTotalSupplyを呼ぶ

- external

#### \_checkpoint(address addr\_)

ve履歴を更新した上で、対象ユーザの最大50エポック分のVotingEscrowに対するアクション履歴を取得し、YMWK報酬額を計算する

- internal
- 引数
  - addr\_
    - 対象ユーザのアドレス

#### userCheckpoint(address addr\_) returns bool

\_checkpointを呼ぶ

- external
- 引数
  - addr\_
    - 対象ユーザのアドレス
- 条件
  - senderがaddr\_またはminter

#### setKilled(bool isKilled\_)

このGaugeをkillする。kill状態ではYMWKインフレーションが0として扱われ、これ以上報酬が蓄積されない

- external
- 引数
  - isKilled\_
    - kill状態のon / off
- 条件
  - 管理者のみ

#### claimableTokens(address addr\_) returns uint256

指定ユーザが現在クレーム可能なYMWK報酬額を返す

- external view
- 引数
  - addr\_
    - 対象ユーザのアドレス

#### integrateCheckpoint() returns uint256

最新のチェックポイントのタイムスタンプを返す

- external view

#### futureEpochTime() returns uint256

Gaugeに保存されているYMWKの次回インフレーションレート更新日時のタイムスタンプを返す

- external view

#### inflationRate() returns uint256

Gaugeに保存されているYMWKのインフレーションレートを返す

- external view

## 参考

### YMWK報酬簡易シミュレーション

https://www.desmos.com/calculator/uslkumq90d

### Curve Contracts

[Curve Liquidity Gauge](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

[Curve Fee Distributor](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/FeeDistributor.vy)
