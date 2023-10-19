# GaugeController

## 概要

Curveの[GaugeController](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/GaugeController.vy)のフォーク。GaugeごとのWeightの管理をする

## 機能

### Struct

### Point

Weight のある時点での状態を格納するための構造体

- bias(uint256)
  - Weightの残高
- slope(uint256)
  - Weightの減り方を表す傾き

### VotedSlope

ユーザが投票の結果実際に割り当てたWeightの情報を保持するための構造体

- slope(uint256)
  - ユーザのVotingPowerのslopeにユーザがその投票に使用した割合を掛けて表される
- power(uint256)
  - ユーザがその投票に使用した割合
- end(uint256)
  - veのロックが終了するタイムスタンプ

## 定数

- WEEK: constant(uint256) = 604800
  - 一週間の秒数
- WEIGHT_VOTE_DELAY: constant(uint256) = 10 \* 86400
  - ユーザごとの投票の最低間隔
- MULTIPLIER: constant(uint256) = 10 \*\* 18
  - 丸め誤差回避用の定数

## プロパティ

- admin: public(address)
  - 管理者のアドレスを保持する
- future_admin: public(address)

  - 次期管理者のアドレスを保持する

- token: public(address)
  - 排出を制御する対象のトークンアドレスを保持する
- votingEscrow: public(address)
  - VotingEscrowコントラクトのアドレスを保持する

### Gauge parameters

- nGaugeTypes: public(int128)
  - Gauge Typeの数を保持する
- nGauges: public(int128)
  - Gaugeの数を保持する
- gaugeTypeNames: public(mapping(int128 => String[64]))

  - Gauge Typeの名称を保持する

- gauges: public(address[1000000000])

  - Gaugeのアドレスを保持する

- gaugeTypes\_: mapping(address => int128)

  - GaugeごとのTypeを保持する

- voteUserSlopes: public(mapping(address => mapping(address => VotedSlope)))
  - ユーザごとにGaugeへ投票したWeightを保持する
  - user -> gauge_addr -> VotedSlope
- voteUserPower: public(mapping(address => uint256))
  - ユーザが使用した合計のVoting powerを保持する
  - 0 - 10000 (0.00% - 100.00%)
- lastUserVote: public(mapping(address => mapping(address => uint256)))

  - ユーザごとに各Gaugeに最後に投票したタイムスタンプを保持する
  - user -> gauge_addr -> timestamp

- pointsWeight: public(mapping(address => mapping(uint256 => Point)))
  - Gaugeごとのポイント履歴
  - gauge_addr -> time -> Point
- changesWeight: mapping(address => mapping(uint256 => uint256))
  - GaugeごとのSlope（Weightの傾斜）履歴
  - gauge_addr -> time -> slope
- timeWeight: public(mapping(address => uint256))

  - GaugeごとのWeightの次回更新予定タイムスタンプ（このタイムスタンプを過ぎると更新処理）
  - gauge_addr -> last scheduled time (next week)

- pointsSum: public(mapping(int128 => mapping(uint256 => Point)))
  - Typeごとのポイント履歴
  - type_id -> time -> Point
- changesSum: mapping(int128 => mapping(uint256 => uint256))
  - Typeごとの合計Slopeの履歴
  - type_id -> time -> slope
- timeSum: public(uint256[1000000000])

  - Typeごとの合計Weightの次回更新予定タイムスタンプ（このタイムスタンプを過ぎると更新処理）
  - type_id -> last scheduled time (next week)

- pointsTotal: public(mapping(uint256 => uint256))
  - 合計Weightの履歴
  - time -> total weight
- timeTotal: public(uint256)

  - 合計Weightの次回更新予定タイムスタンプ（このタイムスタンプを過ぎると更新処理）
  - last scheduled time

- pointsTypeWeight: public(mapping(int128 => mapping(uint256 => uint256)))
  - TypeごとのWeightの履歴
  - type_id -> time -> type weight
- timeTypeWeight: public(uint256[1000000000])
  - TypeごとのWeightの次回更新予定タイムスタンプ（このタイムスタンプを過ぎると更新処理）
  - type_id -> last scheduled time (next week)

## 関数

### 初期化

- adminを設定する
- tokenを設定する
- votingEscrowを設定する
- timeTotalを設定する（block.timestamp / WEEK \* WEEK）

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

### \_getTypeWeight(int128 gaugeType\_) returns uint256

Gauge Typeの過去のWeightの履歴を週ごとに埋め、翌週適用されるWeightを返却する

- internal
- 引数
  - gaugeType\_
    - 対象のGaugeタイプ
- 戻り値
  - 翌週適用されるWeight

### \_getSum(int128 gaugeType\_) returns uint256

Gauge Typeの過去のWeightの合計値の履歴を週ごとに埋め、翌週適用されるWeightの合計値を返却する

- internal
- 引数
  - gaugeType\_
    - 対象のGaugeタイプ
- 戻り値
  - 翌週適用されるWeightの合計値

### \_getTotal() returns uint256

全てのTypeのWeightの合計値の履歴を週ごとに埋め、翌週適用されるWeightの合計値を返却する

- internal
- 戻り値
  - 翌週適用される全てのTypeのWeightの合計値

### \_getWeight(address gaugeAddr\_) returns uint256

対象GaugeのWeightの履歴を週ごとに埋め、翌週適用されるWeightを返却する

- internal
- 引数
  - gaugeAddr\_
    - 対象のGaugeアドレス
- 戻り値
  - 翌週適用されるWeight

### addGauge(address addr\_, int128 gaugeType\_, uint256 weight\_)

任意のWeightでGaugeを追加する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
  - gaugeType\_
    - Gauge Type
  - weight\_
    - 初期に設定するWeight
- 条件
  - 管理者のみ
  - gaugeTypeが0以上であるかつ登録されているGauge数未満であること
  - 同じアドレスのGaugeが登録されていないこと

### addGauge(address addr\_, int128 gaugeType\_)

初期Weight0でGaugeを追加する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
  - gaugeType\_
    - Gauge Type
- 条件
  - 管理者のみ

### checkpoint()

\_getTotal()を呼んで合計Weightの履歴を更新する

- external

### checkpointGauge(address addr\_)

\_getWeight(addr)と\_getTotal()を呼んでGaugeのWeightと合計Weightの履歴を更新する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス

### \_gaugeRelativeWeight(address addr\_, uint256 time\_) returns uint256

指定Gaugeの相対Weightを0から1e18のスケールで返却する。
Gaugeに割り当てられる新規発行トークンは以下の式で計算される。

inflationRate \* relativeWeight / 1e18

- internal
- 引数
  - addr\_
    - 対象のGaugeアドレス
  - time\_
    - Weightを取得するタイムスタンプ
- 戻り値
  - 相対Weight

### gaugeRelativeWeight(address addr\_, uint256 time\_) returns uint256

\_gaugeRelativeWeightを呼んで相対Weightを取得する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
  - time\_
    - Weightを取得するタイムスタンプ
- 戻り値
  - 相対Weight

### gaugeRelativeWeight(address addr\_) returns uint256

\_gaugeRelativeWeightを呼んで現在（block.timestamp）時点での相対Weightを取得する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
- 戻り値
  - 相対Weight

### gaugeRelativeWeightWrite(address addr\_, uint256 time\_) returns uint256

GaugeのWeight履歴とWeightの合計を更新した上で\_gaugeRelativeWeightを呼び、相対Weightを取得する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
  - time\_
    - Weightを取得するタイムスタンプ
- 戻り値
  - 相対Weight

### gaugeRelativeWeightWrite(address addr\_) returns uint256

GaugeのWeight履歴とWeightの合計を更新した上で\_gaugeRelativeWeightを呼び、現在（block.timestamp）時点での相対Weightを取得する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
  - time\_
    - Weightを取得するタイムスタンプ
- 戻り値
  - 相対Weight

### \_changeTypeWeight(int128 typeId\_, uint256 weight\_)

Type Weightを変更する

- internal
- 引数
  - typeId\_
    - 対象のType ID
  - weight\_
    - 変更後のWeight

### addType(String[64] name\_, uint256 weight\_)

Typeを追加する

- internal
- 引数
  - name\_
    - Typeの名称
  - weight\_
    - 初期のWeight
- 条件
  - 管理者のみ

### addType(String[64] name\_)

初期Weight0でTypeを追加する

- internal
- 引数
  - name\_
    - Typeの名称
- 条件
  - 管理者のみ

### changeTypeWeight(int128 typeId\_, uint256 weight\_)

TypeのWeightを変更する

- external
- 引数
  - typeId\_
    - TypeのID
  - weight\_
    - 変更後のWeight
- 条件
  - 管理者のみ

### \_changeGaugeWeight(address addr\_, uint256 weight\_)

Gaugeの Weightを変更する

- internal
- 引数
  - addr\_
    - 対象のGaugeアドレス
  - weight\_
    - 変更後のWeight

### changeGaugeWeight(address addr\_, uint256 weight\_)

Gaugeの Weightを変更する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
  - weight\_
    - 変更後のWeight
- 条件
  - 管理者のみ

### voteForGaugeWeights(address gaugeAddr\_, uint256 userWeight\_)

ユーザのVotingPowerを使用して投票し、GaugeのWeightを変化させる

- external
- 引数
  - gaugeAddr\_
    - 対象のGaugeアドレス
  - userWeight\_
    - ユーザのVotingPowerからの割当てを0(0.00%)〜10000(100.00%)で指定
- 条件
  - ユーザのveロック終了が1週間より先であること
  - userWeightが0〜10000の範囲であること
  - 最後の投票から最低10日間経過していること
  - 指定されたGaugeが登録されていること

### getGaugeWeight(address addr\_) returns uint256

現在のGaugeのWeightを取得する

- external
- 引数
  - addr\_
    - 対象のGaugeアドレス
- 戻り値
  - Weight

### getTypeWeight(int128 typeId\_) returns uint256

現在のTypeのWeightを取得する

- external
- 引数
  - typeId\_
    - 対象のType ID
- 戻り値
  - Weight

### getTotalWeight() returns uint256

現在のWeightの合計値を取得する

- external
- 戻り値
  - Weightの合計値

### getWeightsSumPerType(int128 typeId) returns uint256

現在のTypeのWeightの合計値を取得する

- external
- 引数
  - typeId\_
    - 対象のType ID
- 戻り値
  - Weightの合計値
