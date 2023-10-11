# FeeDistributor

## 概要

オークションの手数料をveYMWKホルダーに報酬として分配する

## 機能

### Struct

#### Point

veYMWK のある時点での状態を格納するための構造体

- bias(int128)
  - veYMWK の残高
- slope(int128)
  - veYMWK の減り方を表す傾き。ロック額 / 最大ロック期間
- ts(uint256)
  - タイムスタンプ
- blk(uint256)
  - ブロック高

### 定数

- WEEK: constant(uint256) = 7 \* 86400

  - 一週間の秒数

- TOKEN_CHECKPOINT_DEADLINE: constant(uint256) = 86400
  - 次回のトークンチェックポイント作成までの最低期間（要検討）

### プロパティ

- factory: public(address)

  - Factoryのアドレスを保持する

- startTime: public(uint256)
  - 報酬の分配を開始するタイムスタンプを保持する
- timeCursor: public(uint256)
  - ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する
- timeCursorOf: public(address => uint256)
  - ユーザごとの、ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する
- userEpochOf: public(address => uint256)
  - ユーザごとの、ve同期が完了している最後（最新）の履歴のエポック数を保持する
- lastTokenTime: public(address => uint256)
  - チェックポイント時点のタイムスタンプをトークンごとに保持する
- tokensPerWeek: public(address => uint256[1000000000000000])
  - 報酬額を週ごと、トークン種別ごとに保持する
- tokenLastBalance: public(address => uint256)

  - チェックポイント時点の残高をトークンごとに保持する

- votingEscrow: public(address)
  - VotingEscrowのアドレスを保持する
- tokenFlags: public(address => bool)
  - トークンのアドレスが報酬トークンとして登録されているかのフラグを保持する
  - 0x0はeth
- tokens: public(address[])
  - 報酬トークンのアドレスを保持する
  - 0x0はeth
- veSupply: public(uint256[1000000000000000])
  - veYMWK残高を週ごとに保持する
- admin: public(address)
  - 管理者のアドレスを保持する
- futureAdmin: public(address)
  - 次期管理者のアドレスを保持する
- canCheckpointToken: public(bool)
  - 第三者によるチェックポイント作成可否フラグ
- emergencyReturn: public(address)
  - 緊急時のトークン送金先を保持する
- isKilled: public(bool)
  - killed / not killed の状態を保持する

### 関数

#### 初期化

- factoryを設定する
- voting_escrowを設定する
- start_timeを設定する
- tokensにethアドレス（0x0）を設定する
- adminを設定する
- emergency_returnを設定する

#### \_checkpointToken(address address\_)

デポジットされたトークンを週ごとに分類する

- internal
- 引数
  - address\_
    - 報酬トークンのアドレス

#### checkpointToken(address address\_)

\_checkpointTokenを呼ぶ

- external
- 引数
  - address\_
    - 報酬トークンのアドレス

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

ve履歴を同期する

- internal

#### checkpointTotalSupply()

\_checkpointTotalSupplyを呼ぶ

- external

#### \_claim(address addr\_, address token\_, address ve\_, uint256 last_token_time\_) returns uint256

指定ユーザの指定トークン報酬額を計算する

- internal
- 引数
  - addr\_
    - 対象ユーザのアドレス
  - token\_
    - 報酬トークンのアドレス
  - ve\_
    - VotingEscrowのアドレス
  - last_token_time\_
    - トークンの最後のチェックポイントのタイムスタンプ
- 戻り値
  - \_amount
    - 指定トークンの報酬額

#### claim(address addr\_, address token\_) returns uint256

報酬をクレームする。View関数として実行することで報酬額を取得する

- external
- 引数
  - addr\_
    - 対象ユーザのアドレス
  - token\_
    - 報酬トークンのアドレス
- 戻り値

  - \_amount
    - 指定トークンの報酬額

- 条件
  - kill状態でない

#### claimMany(address[] receivers\_, address token)

複数のアドレスの報酬をまとめてクレームする

- external
- 引数
  - receivers\_
    - 対象ユーザのアドレス配列
  - token\_
    - 報酬トークンのアドレス
- 条件
  - kill状態でない

#### claimManyTokens(address addr\_, address tokens)

複数のトークン報酬をまとめてクレームする

- external
- 引数
  - receivers\_
    - 対象ユーザのアドレス
  - tokens\_
    - 報酬トークンのアドレス配列
    - 最大20トークンまで（要検討）
- 条件
  - kill状態でない

#### burn(address coin\_) returns bool

対象トークンをmsg.senderから本コントラクトに送金し、チェックポイントを作成する

- external

- 引数
  - coin\_
    - 送金対象トークン
- 条件

  - tokensに登録されているトークンが対象であること
  - kill状態でない

#### commitAdmin(address addr\_)

次期管理者を設定する

- external

- 引数
  - addr\_
    - 次期管理者のアドレス
- 条件

  - adminのみ

#### applyAdmin()

次期管理者を管理者に設定する

- external
- 条件

  - adminのみ

#### toggleAllowCheckpointToken()

チェックポイントの第三者による作成を許可するフラグを切り替える

- 条件

  - adminのみ

#### kill_me()

kill状態をTrueに変更し、トークン残高を全て緊急時のトークン送金先に送金する

- 条件

  - adminのみ

#### recoverBalance(address coin\_) returns bool

指定トークンを全額緊急時のトークン送金先に送金する

- 条件

  - adminのみ
  - 対象トークンがtokensに登録済みであること

#### addRewardToken(address coin\_) returns bool

- Auctionのみ
- external
- 引数
  - address\_
    - address
    - トークンのアドレス

## 参考

### Curve Contracts

[Curve Liquidity Gauge](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

[Curve Fee Distributor](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/FeeDistributor.vy)
