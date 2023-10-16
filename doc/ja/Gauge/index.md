# Gauge

## 概要

[veYMWK](../VotingEscrow/index.md)ホルダーに対する[YMWKトークン](../YamawakeToken/index.md)報酬を計算・保持する。

## 機能

### 定数

uint256 public constant WEEK = 604800
uint256 public constant TOKEN_CHECKPOINT_DEADLINE = 86400

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

- timeCursor: public(uint256)
  - ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する
- timeCursorOf: public(mapping(address => uint256))
  - ユーザごとの、ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する
- userEpochOf: public(mapping(address => uint256))
  - ユーザごとの、ve同期が完了している最後（最新）の履歴のエポック数を保持する
- lastTokenTime: public(uint256)
  - チェックポイント時点のタイムスタンプを保持する
- tokensPerWeek: public(uint256[1000000000000000])

  - 報酬額を週ごとに保持する

- veSupply: public(uint256[1000000000000000])
  - veYMWK残高を週ごとに保持する
- integrateFraction(address => uint256 public)

  - ユーザごとのYMWK報酬の累計を保持する

    - Weight × 各週のYMWK新規発行量 × 各週頭時点でのユーザve残高 / 各週頭時点での累計ve残高

    N週目までのYMWK報酬額：

    $$
    \sum_{n=0}^{N-1}\left(\int_{t_0+ W\cdot n}^{t_0+ W\cdot\left(n+1\right)}r\left(t\right)dt\cdot\frac{b_{u}\left(t_0+ W\cdot n\right)}{S\left(t_0+ W\cdot n\right)}\right)
    $$

    $
    W: 604800（=60*60*24*7）
    $

    $
    r(t): 
    $ YMWKの単位時間あたりの新規発行量（インフレーションレート）

    $
    S(t): 
    $ t時点でのve残高

    $
    b_u(t): 
    $ t時点でのユーザve残高

    $
    t_0:
    $ 報酬分配を開始するタイムスタンプ

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

#### \_checkpointToken()

期間中のYMWK新規発行額を週ごとに分配する

- internal

#### checkpointToken()

\_checkpointTokenを呼ぶ

- external

#### \_findTimestampEpoch(address ve\_, uint256 timestamp\_) returns uint256

タイムスタンプからエポックをバイナリサーチ

- internal
- 引数
  - ve\_
    - VotingEsctowのアドレス
  - timestamp\_
    - 検索対象のタイムスタンプ

#### \_findTimestampUserEpoch(address ve\_, address user\_, uint256 timestamp\_, uint256 maxUserEpoch\_) returns uint256

タイムスタンプからユーザエポックをバイナリサーチ

- internal
- 引数
  - ve\_
    - VotingEsctowのアドレス
  - user\_
    - 検索対象のユーザ
  - timestamp\_
    - 検索対象のタイムスタンプ

#### veForAt(address user\_ , uint256 timestamp\_) returns uint256

指定のタイムスタンプ時点でのユーザのve残高を返す

- external
- 引数
  - user\_
    - 検索対象のユーザ
  - timestamp\_
    - 検索対象のタイムスタンプ

#### \_checkpointTotalSupply()

- ve履歴を同期する

  - 最後に同期された時点から20週分に渡りveYMWK残高をVoting Escrowから情報を取得する
  - Gauge ControllerからWeightを取得する
  - YMWKトークンのインフレーションレートの更新タイムスタンプを跨ぐ場合はYMWKトークンのインフレーションレートと次回のインフレーションレート更新タイムスタンプを更新する
  - それぞれの週について、veYMWK残高に対するYMWKインフレーション量の割合を計算し履歴を更新する
  - 履歴のタイムスタンプを更新する

- internal

#### checkpointTotalSupply()

\_checkpointTotalSupplyを呼ぶ

- external

#### \_claim(address addr\_, address ve\_, uint256 lastTokenTime\_) returns uint256

- 指定ユーザの報酬額を計算する

  - 最後に同期されたユーザの履歴から最大50回分の履歴を取得する
  - 各週についてYMWK報酬を計算し、記録する
  - 履歴のタイムスタンプ、エポック数を更新する

- internal
- 引数
  - addr\_
    - 対象ユーザのアドレス
  - ve\_
    - VotingEscrowのアドレス
  - last_token_time\_
    - トークンの最後のチェックポイントのタイムスタンプ
- 戻り値
  - \_amount
    - 指定トークンの報酬額

#### claim(address addr\_) returns uint256

報酬をクレームする。View関数として実行することで報酬額を取得する

- external
- 引数
  - addr\_
    - 対象ユーザのアドレス
- 戻り値

  - \_amount
    - 指定トークンの報酬額

- 条件
  - kill状態でない

#### claimMany(address[] receivers\_)

複数のアドレスの報酬をまとめてクレームする

- external
- 引数
  - receivers\_
    - 対象ユーザのアドレス配列
- 条件
  - kill状態でない

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

https://www.desmos.com/calculator/9qm15hlyjq

### Curve Contracts

[Curve Liquidity Gauge](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

[Curve Fee Distributor](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/FeeDistributor.vy)
