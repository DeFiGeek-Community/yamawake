# FeeDistributor

## 概要

オークションの手数料をveYMWKホルダーに報酬として分配する

## 機能

### 定数

- WEEK: constant(uint256) = 7 \* 86400
  - 一週間の秒数

### プロパティ

- address public immutable factory

  - Factoryのアドレスを保持する

- uint256 public startTime
  - 報酬の分配を開始するタイムスタンプを保持する
- uint256 public timeCursor
  - ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する
- mapping(address => mapping(address => uint256)) public timeCursorOf
  - ユーザごと、トークンごとに報酬のクレームが完了している週の次週頭（WEEKの倍数）のタイムスタンプを保持する
- mapping(address => mapping(address => uint256)) public userEpochOf
  - ユーザごと、トークンごとにVotingEscrowのuserPointHistoryと同期が完了しているエポック数を保持する
- mapping(address => uint256) public lastTokenTime
  - チェックポイント時点のタイムスタンプをトークンごとに保持する
- mapping(address => mapping(uint256 => uint256)) public tokensPerWeek

  - 報酬額を週ごと、トークン種別ごとに保持する

- address public votingEscrow
  - VotingEscrowのアドレスを保持する
- address[] public tokens
  - 報酬トークンのアドレスを保持する
  - 0x0はeth
- mapping(address => uint256) public tokenFlags

  - トークンのアドレスが報酬トークンとして登録されているかのフラグを保持する
  - 0 -> 未登録, 1 -> 登録済み
  - address 0x0はeth

- mapping(address => uint256) public tokenLastBalance

  - チェックポイント時点の残高をトークンごとに保持する

- mapping(uint256 => uint256) public veSupply
  - veYMWK総残高を週ごとに保持する
- address public admin
  - 管理者のアドレスを保持する
- address public futureAdmin
  - 次期管理者のアドレスを保持する
- address public emergencyReturn
  - 緊急時のトークン送金先を保持する
- bool public isKilled
  - killed / not killed の状態を保持する

### 関数

#### constructor(address votingEscrow\_, address factory\_, uint256 startTime\_, address admin\_, address emergencyReturn\_)

- 処理概要
  - startTimeを引数で与えられたstartTime\_の週始めのタイムスタンプに設定する
  - ethのlastTokenTimeを引数で与えられたstartTime\_の週始めのタイムスタンプに設定する
  - timeCursorを引数で与えられたstartTime\_の週始めのタイムスタンプに設定する
  - tokensにethアドレス（0x0）を追加する
  - tokenFlagsのethアドレス（0x0）をtrueに設定する
  - votingEscrowを設定する
  - factoryを設定する
  - adminを設定する
  - emergencyReturnを設定する
- 引数
  - votingEscrow\_,
    - VotingEscrowのアドレス
  - factory\_,
    - Factoryのアドレス
  - startTime\_,
    - 報酬の分配を開始するタイムスタンプ
  - admin\_,
    - 管理者アドレス
  - emergencyReturn\_
    - killMe、recoverBalance実行時にコントラクトの残高を送信するアドレス

#### \_checkpointToken(address address\_)

実行された時点の指定トークン残高と前回チェックポイント時の残高の差額を前回チェックポイントからの経過時間で割り、各週ごとに分配する。
前回チェックポイントから週を跨ぐ場合は前回チェックポイントの翌週分から分配を開始する。
前回チェックポイントから20週間以上が経過している場合は、今回チェックポイント週を含め過去20週間に対して分配する。

- internal
- 引数
  - address\_
    - 報酬トークンのアドレス

#### checkpointToken(address address\_)

\_checkpointTokenを実行する

- external
- 引数
  - address\_
    - 報酬トークンのアドレス
- 条件
  - address\_がFeeDistributorに登録されていること
  - 管理者またはオークション

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

#### \_claim(address addr\_, address token\_, address ve\_, uint256 last_token_time\_) returns uint256

指定ユーザの指定トークン報酬額を、実行時点の前週分まで計算する。以前の実行からのユーザエポック数 + 経過週が50以上の場合は前週分までの計算のために複数回の呼び出しが必要

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

#### claim(address token\_) returns uint256

msg.senderに対して報酬をクレームする。View関数として実行することでクレーム可能は報酬額を取得する

- external
- 引数
  - token\_
    - 報酬トークンのアドレス
- 戻り値

  - \_amount
    - 指定トークンの報酬額

- 条件
  - kill状態でない
  - 対象トークンがtokensに登録済みであること

#### claim(address addr\_, address token\_) returns uint256

指定のアドレスの報酬をクレームする。View関数として実行することでクレーム可能は報酬額を取得する

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
  - 対象トークンがtokensに登録済みであること

#### claimMany(address[] receivers\_, address token\_)

複数のアドレスの報酬をまとめてクレームする

- external
- 引数
  - receivers\_
    - 対象ユーザのアドレス配列
  - token\_
    - 報酬トークンのアドレス
- 条件
  - kill状態でない
  - 対象トークンがtokensに登録済みであること

#### claimMultipleTokens(address addr\_, address[20] tokens\_)

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
  - 対象トークンがtokensに登録済みであること

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

#### kill_me()

kill状態をTrueに変更し、Ether残高を緊急時のトークン送金先に送金する

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
