# Gauge

## 概要

[veYMWK](../VotingEscrow/index.md)ホルダーに対する[YMWKトークン](../YamawakeToken/index.md)報酬を計算・保持する。

## 機能

### 定数

- uint256 public constant WEEK = 604800

  - 1週間の秒数

### プロパティ

- uint256 public immutable startTime

  - トークンの配布を開始する週頭のタイムスタンプ

- address public immutable token

  - YMWKトークンのアドレスを保持する

- address public immutable votingEscrow

  - VotingEscrowのアドレスを保持する

- address public immutable minter

  - ミンターのアドレスを保持する

- address public immutable gaugeController

  - ゲージコントローラーのアドレスを保持する

- address public admin

  - 管理者アドレスを保持する

- uint256 public futureEpochTime

  - 次回のインフレーションレート変更タイムスタンプを保持する

- uint256 public inflationRate

  - YMWKのインフレーションレートを保持する

- uint256 public timeCursor

  - 次回checkpointTotalSupplyでve同期を開始する週頭のタイムスタンプを保持する

- uint256 public tokenTimeCursor

  - 次回checkpointTokenで週ごとのトークン報酬の集計を開始する週頭のタイムスタンプを保持する

- uint256 public isKilled

  - kill状態フラグ。 0 -> 通常状態, 1 -> kill状態

- mapping(address => uint256) public timeCursorOf

  - ユーザごとの、次回のuserCheckpoint時に報酬の計算を開始する週頭のタイムスタンプを保持する

- mapping(address => uint256) public userEpochOf

  - ユーザごとの、ve同期が完了している最新のエポック数を保持する

- mapping(uint256 => uint256) public tokensPerWeek

  - 報酬額（このGaugeに割当てられるYMWKのMint権利）を週ごとに保持する

- mapping(uint256 => uint256) public veSupply

  - veYMWK総残高を週ごとに保持する

- mapping(address => uint256) public integrateFraction

  - ユーザごとに割当てられるYMWK報酬額の累計を保持する

    - Weight × 各週のYMWK新規発行量 × 各週頭時点でのユーザve残高 / 各週頭時点での累計ve残高

    N週目までのYMWK報酬額：

    $$\sum_{n=0}^{N-1}\left(\int_{t_n}^{t_{n+1}}r\left(t\right)dt\cdot w\left(t_n\right) \cdot \frac{b_{u}\left(t_n\right)}{S\left(t_n\right)}\right)$$

    $W: 604800（=60\cdot60\cdot24\cdot7）$

    $r(t): \text{YMWKの単位時間あたりの新規発行量}$

    $w(t): \text{t時点でのWeight}$

    $S(t): \text{t時点でのve残高}$

    $b_u(t): \text{t時点でのユーザve残高}$

    $t_0: \text{報酬分配を開始するタイムスタンプ}$

    $t_n: \text{n週目頭のタイムスタンプ}（t_0 + W \cdot n）$

### 関数

#### constructor(address minter\_, uint256 startTime\_)

- minterを設定する
- tokenを設定する
- gaugeControllerを設定する
- votingEscrowを設定する
- adminを設定する
- inflationRateをtokenから取得し、設定する
- futureEpochTimeをtokenから取得し、設定する
- startTimeにstartTime\_で与えられたタイムスタンプの週の頭を計算し設定する
- tokenTimeCursorにstartTime\_で与えられたタイムスタンプの週の頭を計算し設定する
- timeCursorにstartTime\_で与えられたタイムスタンプの週の頭を計算し設定する

#### \_checkpointToken()

tokenTimeCursor時点から、実行された時点の前週分までの、このGaugeに割り振られるYMWK報酬額を、各週ごとに最大20週間分計算し、分配する。

- internal

#### checkpointToken()

\_checkpointTokenを実行する

- external
- 条件
  - 管理者、または実行時の週がtokenTimeCursorの週を過ぎていること

#### \_findTimestampEpoch(address ve\_, uint256 timestamp\_) returns uint256

タイムスタンプからVotingEscrowのpointHistoryを検索し、タイムスタンプより過去に作成された一番近いエポック数を返却する

- internal
- 引数
  - ve\_
    - VotingEsctowのアドレス
  - timestamp\_
    - 検索対象のタイムスタンプ
- 戻り値
  - 指定タイムスタンプ直前のエポック数

#### \_findTimestampUserEpoch(address ve\_, address user\_, uint256 timestamp\_, uint256 maxUserEpoch\_) returns uint256

タイムスタンプからVotingEscrowのpointHistoryを検索し、タイムスタンプより過去に作成された一番近いユーザエポック数を返却する

- internal
- 引数
  - ve\_
    - VotingEsctowのアドレス
  - user\_
    - 検索対象のユーザ
  - timestamp\_
    - 検索対象のタイムスタンプ
- 戻り値
  - 指定タイムスタンプ直前のユーザエポック数

#### veForAt(address user\_ , uint256 timestamp\_) returns uint256

指定のタイムスタンプ時点でのユーザのve残高を返す

- external
- 引数
  - user\_
    - 検索対象のユーザ
  - timestamp\_
    - 検索対象のタイムスタンプ
- 戻り値
  - 指定タイムスタンプ時点でのユーザveYMWK残高

#### \_checkpointTotalSupply()

VotingEscrowのchekpointを実行した上で、過去最大20週間分の各週初め時点でのveYMWK残高履歴を記録する

- internal

#### checkpointTotalSupply()

\_checkpointTotalSupplyを実行する

- external

#### \_checkpoint(address addr\_)

指定ユーザの報酬額を計算する

- 実行時点が、前回のveYMWK総残高更新から週を跨いでいる場合

  - \_checkpointTotalSupplyを呼んでveYMWK総残高の履歴を更新

- 実行時点が、報酬の計算が完了している最後の週から週を跨いでいる場合

  - \_checkpointTokenを呼んで、計算が完了していない週の報酬を計算

- ユーザにveの履歴がない場合

  - 終了

- timeCursorOfの週からveYMWK総残高の同期とYMWK報酬の計算が完了している週まで週ごとにユーザに割当てられる報酬額を計算する
- ユーザエポックを記録する
- 報酬額の累計を更新する

- internal
- 引数
  - addr\_
    - 対象ユーザのアドレス

#### userCheckpoint(address addr\_) returns (bool)

\_checkpointを実行する

- external
- 引数
  - addr\_
    - 対象ユーザのアドレス
- 戻り値

  - true

- 条件
  - addr\_本人またはminter

#### setKilled(bool isKilled\_)

このGaugeをkillする。kill状態ではYMWKインフレーションが0として扱われ、これ以上報酬が蓄積されない

- external
- 引数
  - isKilled\_
    - kill状態のon / off
- 条件
  - 管理者のみ

#### claimableTokens(address addr\_) returns (uint256)

指定ユーザが現在クレーム可能なYMWK報酬額を返す

- external view
- 引数
  - addr\_
    - 対象ユーザのアドレス
- 戻り値
  - クレーム可能な報酬額

## 参考

### YMWK報酬簡易シミュレーション

https://www.desmos.com/calculator/9qm15hlyjq

### Curve Contracts

[Curve Liquidity Gauge](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

[Curve Fee Distributor](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/FeeDistributor.vy)
