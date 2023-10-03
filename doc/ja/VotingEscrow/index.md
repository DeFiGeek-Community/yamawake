# VotingEscrow

## 概要

YMWK トークンをロックし、移転不可のveYMWK トークンを発行する。
ロック期間は最大4年間、最小単位は1週間で、veYMWKはロック後の時間経過により線形に減衰する。1YMWKを4年間ロックすると1veYMWKが発行される。

#### 参考

- [veYMWKホルダーに対するYMWK報酬額の割当額シミュレーション](https://www.desmos.com/calculator/uslkumq90d?lang=ja)
- [Curve DAO: Vote-Escrowed CRV](https://etherscan.io/address/0x5f3b5dfeb7b28cdbd7faba78963ee202a494e2a2#readContract)
- [Curve VotingEscrow Contract](https://curve.readthedocs.io/dao-vecrv.html)
- [The Curve DAO: Liquidity Gauges and Minting CRV](https://curve.readthedocs.io/dao-gauges.html)
- [LiquidityGaugeV6 Contract](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

## Struct

### Point

veYMWK のある時点での状態を格納するための構造体

- bias(int128)
  - veYMWK の残高[](https://discord.com/channels/729808684359876718/729812922649542758/1117882385267163206)
- slope(int128)
  - veYMWK の減り方を表す傾き。ロック額 / 最大ロック期間
- ts(uint256)
  - タイムスタンプ
- blk(uint256)
  - ブロック高

### LockedBalance

ロックの情報を格納するための構造体

- amount(int128)
  - ロック量
- end(uint256)
  - ロックが終了する時点のタイムスタンプ

## 定数

### DEPOSIT_FOR_TYPE(int128)

イベント識別用

### CREATE_LOCK_TYPE(int128)

イベント識別用

### INCREASE_LOCK_AMOUNT(int128)

イベント識別用

### INCREASE_UNLOCK_TIME(int128)

イベント識別用

### WEEK(uint256)

1 週間（7 \* 86400）

### MAXTIME(uint256)

4 年間（4 \* 365 \* 86400）

### MULTIPLIER(uint256)

除算時の丸め誤差防止に使用する定数 (10^18)

## プロパティ

### token: public(address)

ロック対象のトークンアドレス（YMWK のコントラクトアドレスを想定）

### supply: public(uint256)

ロック対象トークンの総ロック量。デポジット、引き出し時に変化

### locked: public(address => LockedBalance)

ユーザごとのトークンロック情報（量、終了タイムスタンプ）を格納

### epoch: public(uint256)

全てのユーザのアクションごとにインクリメントするグローバルなインデックス

### point_history: public(Point[])

veYMWKのグローバルな状態を epoch ごとに記録する配列

### user_point_history: public(address => Point[])

veYMWKのユーザごとの状態を user epoch ごとに記録する配列

### user_point_epoch: public(address => uint256)

各ユーザのアクションごとにインクリメントするローカルなインデックス

### slope_changes: public(uint256 => uint128)

ある時点で予定されている slope の変化を記録する。ユーザのデポジットやロック期間変更時に更新される。週単位のタイムスタンプ（WEEK の倍数）がキーになり、ユーザのアクション時に該当する slope の変化がある場合は Point の slope にこの変化を適用する。

### controller: public(address)

Aragon互換性のため

### transfersEnabled: public(bool)

Aragon互換性のため

### name: public(string)

ve トークン名

### symbol: public(string)

ve トークンシンボル

### version: public(string)

ve トークンバージョン

### decimals: public(uint256)

ve トークンデシマル

### future_smart_wallet_checker: public(address)

Checker for whitelisted (smart contract) wallets which are allowed to deposit
The goal is to prevent tokenizing the escrow

### smart_wallet_checker: public(address)

Checker for whitelisted (smart contract) wallets which are allowed to deposit
The goal is to prevent tokenizing the escrow

CurveのVotingEscrowでは現在下記コントラクトが登録されている
https://etherscan.io/address/0xca719728Ef172d0961768581fdF35CB116e0B7a4#readContract

### admin: public(address)

管理者アドレス

### future_admin: public(address)

次期管理者アドレス

### integrate_inv_supply: public(uint256[])

CurveのLiquidityGauseから追加

veYMWKの総発行量をtについて積分した値をepochごとに保持する（Pointに含められそう -> point_history\[epoch\].integrate_inv_supply）

### integrate_inv_supply_of: public(address => uint256)

CurveのLiquidityGauseから追加

各ユーザの最後のアクション時のintegrate_inv_supplyの値。ユーザアクション時に期間中に発生した報酬の計算のために参照される。（Pointに含められそう -> user_point_history\[addr\]\[epoch\].integrate_inv_supply）

### integrate_checkpoint_of: public(address => uint256)

CurveのLiquidityGauseから追加

各ユーザの最後のアクション時のタイムスタンプ（user_point_historyのtsと同じなので不要と思われる）

### integrate_fraction: public(address => uint256)

各ユーザのve残高の合計ve残高に対する割合を時間で積分した値

# 機能

### **init**(token_addr: address, \_name: String[64], \_symbol: String[32], \_version: String[32]) external

初期化

- adminにmsg.senderを設定
- tokenにtoken_addrを設定
- point_history[0].blkにblock.numberを設定
- point_history[0].tsにblock.timestampを設定
- controllerにmsg.senderを設定
- transfersEnabledにTrueを設定
- decimalsにtokenのdecimalsと同じ値を設定
- nameに\_nameを設定
- symbolに\_symbolを設定
- versionに\_versionを設定

### commit_transfer_ownership(addr: address) external

- 次期管理者アドレスを設定
- 管理者のみ

### apply_transfer_ownership() external

- 管理者アドレスに次期管理者アドレスを設定
- 管理者のみ

### commit_smart_wallet_checker(addr: address) external

- 次期スマートウォレットチェッカーを設定
- 管理者のみ

### apply_smart_wallet_checker() external

- スマートウォレットチェッカーに次期スマートウォレットチェッカーを設定
- 管理者のみ

### assert_not_contract(addr: address) internal

- スマートウォレットチェッカーを使用して対象アドレスがホワイトリストされたスマコンかどうかチェックする

### get_last_user_slope(addr: address) -> int128 external view

- 指定アドレスの最新の slope を返す

### user_point_history\_\_ts(\_addr: address, \_idx: uint256) -> uint256 external view

- 指定アドレスの指定インデックス（user epoch）のタイムスタンプを返す

### locked\_\_end(\_addr: address) -> uint256 external view

- 指定アドレスのロック終了時点タイムスタンプを返す

### \_checkpoint(addr: address, old_locked: LockedBalance, new_locked: LockedBalance) internal

各ユーザアクションごとにコールされ、ポイント履歴、報酬情報を更新する

- addr が ZERO_ADDRESS でない場合
  - addr の新旧 slope と bias を計算
  - slope の変化（slope_changes）を計算
  - ユーザのポイント履歴を更新
  - ユーザごとの報酬の計算をする
    - integrate_inv_supply_of
    - integrate_checkpoint_of
    - integrate_fraction
- ポイント履歴の最後の時点から 最大 255 週分の履歴を作成する。255 週以上の期間に渡って履歴がない場合(=ユーザ操作がない場合）は正しい計算ができなくなる
- integrate_inv_supplyを更新する

### \_deposit_for(\_addr: address, \_value: uint256, unlock_time: uint256, locked_balance: LockedBalance, type: int128) internal

- 任意の addr に代わって YMWK を任意の量ロックする

### checkpoint() external

- \_checkpoint を呼び、veYMWK のグローバルな状態を更新する

### deposit_for(\_addr: address, \_value: uint256) external

- \_deposit_for を呼び、任意の addr に代わって YMWK を任意の量ロックする
- 既存のロックがない場合はリバート

### create_lock(\_value: uint256, \_unlock_time: uint256) external

- 新規にロックを作成する
- 既存のロックがある場合はリバート

### increase_amount(\_value: uint256) external

- ロック量を増額する

### increase_unlock_time(\_unlock_time: uint256) external

- ロック期間を延長する

### withdraw() external

- ロック期間が終了した YMWK を引き出す

### find_block_epoch(\_block: uint256, max_epoch: uint256) -> uint256 internal view

- 指定したブロック高に一番近い epoch を検索して返す

### balanceOf(addr: address, \_t: uint256 = block.timestamp) -> uint256 external view

- 指定したアドレスの指定したタイムスタンプ時点でのveYMWK残高を返す
- \_t が最後に記録されたユーザのポイント履歴より前の場合は失敗する

### balanceOfAt(addr: address, \_block: uint256) -> uint256 external view

- 指定したアドレスの指定したブロック高時点でのveYMWK残高を返す

### supply_at(point: Point, t: uint256) -> uint256 internal view

- 指定したポイントを起点に指定したタイムスタンプ時点での 総veYMWK残高を返す
- 255 週以上ポイントが記録されていない状況の場合は正しい計算ができなくなる

### totalSupply(t: uint256 = block.timestamp) -> uint256 external view

- 最後に記録されたポイントを起点に、指定したタイムスタンプ時点の総veYMWK残高を返す

### totalSupplyAt(\_block: uint256) -> uint256 external view

- 指定したブロック高時点での総veYMWK残高を返す

### changeController(\_newController: address) external

- controller のみ
- controller を変更する
- Aragon互換性のためのダミー関数
