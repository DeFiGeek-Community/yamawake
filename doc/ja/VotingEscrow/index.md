# VotingEscrow

## 概要

Curveの[VotingEscrow](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/VotingEscrow.vy)からのフォークコントラクト。

YMWK トークンをロックし、移転不可のveYMWK トークンを発行する。
ロック期間は最大4年間、最小単位は1週間で、veYMWKはロック後の時間経過により線形に減衰する。1YMWKを4年間ロックすると1veYMWKが発行される。

### Curve版からの主な変更点

- コントラクトからの操作を許可
  - smart_wallet_checker, future_smart_wallet_checker, assert_not_contract(), apply_smart_wallet_checker(), commit_smart_wallet_checker() の削除
- Admin, Controller関連機能を削除
  - admin, future_admin, apply_transfer_ownership(), commit_transfer_ownership() の削除
  - controller, transfersEnabled, changeController() の削除

#### 参考

- [veYMWKホルダーに対するYMWK報酬額の割当額シミュレーション](https://www.desmos.com/calculator/uslkumq90d?lang=ja)
- [Curve DAO: Vote-Escrowed CRV](https://etherscan.io/address/0x5f3b5dfeb7b28cdbd7faba78963ee202a494e2a2#readContract)
- [Curve VotingEscrow Contract](https://curve.readthedocs.io/dao-vecrv.html)
- [The Curve DAO: Liquidity Gauges and Minting CRV](https://curve.readthedocs.io/dao-gauges.html)
- [LiquidityGaugeV6 Contract](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

## 機能

### Struct

#### `Point`

veYMWK のある時点での状態を格納するための構造体

- bias(int128)
  - veYMWK の残高[](https://discord.com/channels/729808684359876718/729812922649542758/1117882385267163206)
- slope(int128)
  - veYMWK の減り方を表す傾き。ロック額 / 最大ロック期間
- ts(uint256)
  - タイムスタンプ
- blk(uint256)
  - ブロック高

#### `LockedBalance`

ロックの情報を格納するための構造体

- amount(int128)
  - ロック量
- end(uint256)
  - ロックが終了する時点のタイムスタンプ

### 定数

#### `DEPOSIT_FOR_TYPE: int128`

イベント識別用

#### `CREATE_LOCK_TYPE: int128`

イベント識別用

#### `INCREASE_LOCK_AMOUNT: int128`

イベント識別用

#### `INCREASE_UNLOCK_TIME: int128`

イベント識別用

#### `WEEK: uint256`

1 週間（7 \* 86400）

#### `MAXTIME: uint256`

4 年間（4 \* 365 \* 86400）

#### `MULTIPLIER: uint256`

除算時の丸め誤差防止に使用する定数 (10^18)

### プロパティ

#### `token: address public`

ロック対象のトークンアドレス（YMWK のコントラクトアドレスを想定）

#### `supply: uint256 public`

ロック対象トークンの総ロック量。デポジット、引き出し時に変化

#### `locked: mapping(address => LockedBalance) public`

ユーザごとのトークンロック情報（量、終了タイムスタンプ）を格納

#### `epoch: uint256 public`

全てのユーザのアクションごとにインクリメントするグローバルなインデックス

#### `pointHistory: mapping(uint256 => Point) public`

veYMWKのグローバルな状態を epoch ごとに記録する配列

#### `userPointHistory: mapping(address => mapping(uint256 => Point)) public`

veYMWKのユーザごとの状態を user epoch ごとに記録する配列

#### `userPointEpoch: mapping(address => uint256) public`

各ユーザのアクションごとにインクリメントするローカルなインデックス

#### `slopeChanges: mapping(uint256 => int128) public`

ある時点で予定されている slope の変化を記録する。ユーザのデポジットやロック期間変更時に更新される。週単位のタイムスタンプ（WEEK の倍数）がキーになり、ユーザのアクション時に該当する slope の変化がある場合は Point の slope にこの変化を適用する。

#### `name: string public`

ve トークン名

#### `symbol: string public`

ve トークンシンボル

#### `version: string public`

ve トークンバージョン

#### `decimals: uint256 public`

ve トークンデシマル

### 関数

#### 初期化

```solidity
constructor(
    address tokenAddr_,
    string memory name_,
    string memory symbol_
)
```

- tokenにtoken_addrを設定
- point_history[0].blkにblock.numberを設定
- point_history[0].tsにblock.timestampを設定
- transfersEnabledにTrueを設定
- decimalsにtokenのdecimalsと同じ値を設定
- nameに\_nameを設定
- symbolに\_symbolを設定

**引数**

| 引数名       | 型        | 概要                     | 制約 |
| ------------ | --------- | ------------------------ | ---- |
| `tokenAddr_` | `address` | ve化対象トークンアドレス | -    |
| `name_`      | `uint256` | トークン名               | -    |
| `symbol_`    | `uint256` | トークンシンボル         | -    |

---

#### `getLastUserSlope`

```solidity
function getLastUserSlope(address addr_) external view returns (int128)
```

指定アドレスの最新の slope を返す

**引数**

| 引数名  | 型        | 概要               | 制約 |
| ------- | --------- | ------------------ | ---- |
| `addr_` | `address` | 対象ユーザアドレス | -    |

**戻り値**

- `int128`
  - 指定アドレスの最新の slope

---

#### `userPointHistoryTs`

```solidity
function userPointHistoryTs(
    address addr_,
    uint256 idx_
) external view returns (uint256)
```

指定アドレスの指定インデックス（user epoch）のタイムスタンプを返す

**引数**

| 引数名  | 型        | 概要               | 制約 |
| ------- | --------- | ------------------ | ---- |
| `addr_` | `address` | 対象ユーザアドレス | -    |
| `idx_`  | `uint256` | ユーザエポック     | -    |

**戻り値**

- `uint256`
  - 指定アドレスの指定ユーザエポック時点のタイムスタンプ

---

#### `lockedEnd`

```solidity
function lockedEnd(address addr_) external view returns (uint256)
```

指定アドレスのロック終了時点タイムスタンプを返す

**引数**

| 引数名  | 型        | 概要               | 制約 |
| ------- | --------- | ------------------ | ---- |
| `addr_` | `address` | 対象ユーザアドレス | -    |

**戻り値**

- `uint256`
  - 指定アドレスのロック終了時点タイムスタンプ

---

#### `_checkpoint`

```solidity
function _checkpoint(
    address addr_,
    LockedBalance memory oldLocked_,
    LockedBalance memory newLocked_
) internal
```

各ユーザアクションごとにコールされ、ポイント履歴、報酬情報を更新する

- addr が ZERO_ADDRESS でない場合
  - addr の新旧 slope と bias を計算
  - slope の変化（slope_changes）を計算
  - ユーザのポイント履歴を更新
- ポイント履歴の最後の時点から 最大 255 週分の履歴を作成する。255 週以上の期間に渡って履歴がない場合(=ユーザ操作がない場合）は正しい計算ができなくなる

**引数**

| 引数名       | 型              | 概要               | 制約 |
| ------------ | --------------- | ------------------ | ---- |
| `addr_`      | `address`       | 対象ユーザアドレス | -    |
| `oldLocked_` | `LockedBalance` | 過去のロック情報   | -    |
| `newLocked_` | `LockedBalance` | 新しいロック情報   | -    |

---

#### `_depositFor`

```solidity
function _depositFor(
    address addr_,
    uint256 value_,
    uint256 unlockTime_,
    LockedBalance memory lockedBalance_,
    uint128 type_
) internal
```

任意の addr に代わって YMWK を任意の量ロックする

**引数**

| 引数名           | 型              | 概要                         | 制約 |
| ---------------- | --------------- | ---------------------------- | ---- |
| `addr_`          | `address`       | 対象ユーザアドレス           | -    |
| `value_`         | `uint256`       | ロックする額                 | -    |
| `unlockTime_`    | `uint256`       | ロック終了時のタイムスタンプ | -    |
| `lockedBalance_` | `LockedBalance` | 過去のロック情報             | -    |
| `type_`          | `uint128`       | イベント識別子               | -    |

---

#### `checkpoint`

```solidity
function checkpoint() external
```

- \_checkpoint を呼び、veYMWK のグローバルな状態を更新する

#### `depositFor`

```solidity
function depositFor(address addr_, uint256 value_) external nonReentrant
```

- \_deposit_for を呼び、任意の addr に代わって YMWK を任意の量ロックする
- 既存のロックがない場合はリバート

**引数**

| 引数名   | 型        | 概要               | 制約 |
| -------- | --------- | ------------------ | ---- |
| `addr_`  | `address` | 対象ユーザアドレス | -    |
| `value_` | `uint256` | ロックする額       | -    |

#### `createLock`

```solidity
function createLock(
    uint256 value_,
    uint256 unlockTime_
) external nonReentrant
```

- 新規にロックを作成する
- 既存のロックがある場合はリバート

**引数**

| 引数名        | 型        | 概要                         | 制約 |
| ------------- | --------- | ---------------------------- | ---- |
| `value_`      | `uint256` | ロックする額                 | -    |
| `unlockTime_` | `uint256` | ロック終了時のタイムスタンプ | -    |

---

#### `increaseAmount`

```solidity
function increaseAmount(uint256 value_) external nonReentrant
```

ロック量を増額する

**引数**

| 引数名   | 型        | 概要         | 制約 |
| -------- | --------- | ------------ | ---- |
| `value_` | `uint256` | ロックする額 | -    |

---

#### `increaseUnlockTime`

```solidity
function increaseUnlockTime(uint256 unlockTime_) external nonReentrant
```

ロック期間を延長する

**引数**

| 引数名        | 型        | 概要                         | 制約 |
| ------------- | --------- | ---------------------------- | ---- |
| `unlockTime_` | `uint256` | ロック終了時のタイムスタンプ | -    |

---

#### `withdraw`

```solidity
function withdraw() external nonReentrant
```

ロック期間が終了した YMWK を引き出す

---

#### `findBlockEpoch`

```solidity
function findBlockEpoch(
    uint256 block_,
    uint256 maxEpoch_
) internal view returns (uint256)
```

指定したブロック高に一番近い epoch を検索して返す

**引数**

| 引数名      | 型        | 概要                     | 制約 |
| ----------- | --------- | ------------------------ | ---- |
| `block_`    | `uint256` | ブロック高               | -    |
| `maxEpoch_` | `uint256` | 検索範囲の最大エポック数 | -    |

**戻り値**

- `uint256`
  - 指定したブロック高に一番近い epoch

---

#### `balanceOf`

```solidity
function balanceOf(
    address addr_,
    uint256 t_
) external view returns (uint256)
```

- 指定したアドレスの指定したタイムスタンプ時点でのveYMWK残高を返す
- \_t が最後に記録されたユーザのポイント履歴より前の場合は失敗する

**引数**

| 引数名  | 型        | 概要               | 制約                                         |
| ------- | --------- | ------------------ | -------------------------------------------- |
| `addr_` | `address` | 対象ユーザアドレス | -                                            |
| `t_`    | `uint256` | タイムスタンプ     | 最後に記録されたユーザのポイント履歴より未来 |

**戻り値**

- `uint256`
  - 指定したアドレスの指定したタイムスタンプ時点でのveYMWK残高

---

#### `balanceOf`

```solidity
function balanceOf(
    address addr_,
) external view returns (uint256)
```

指定したアドレスの現時点でのveYMWK残高を返す

**引数**

| 引数名  | 型        | 概要               | 制約 |
| ------- | --------- | ------------------ | ---- |
| `addr_` | `address` | 対象ユーザアドレス | -    |

**戻り値**

- `uint256`
  - 指定したアドレスの現時点でのveYMWK残高

---

#### `balanceOfAt`

```solidity
function balanceOfAt(
    address addr_,
    uint256 block_
) external view returns (uint256)
```

指定したアドレスの指定したブロック高時点でのveYMWK残高を返す

**引数**

| 引数名   | 型        | 概要               | 制約                             |
| -------- | --------- | ------------------ | -------------------------------- |
| `addr_`  | `address` | 対象ユーザアドレス | -                                |
| `block_` | `uint256` | ブロック高         | 現在のブロック高より前であること |

**戻り値**

- `uint256`
  - 指定したアドレスの指定したブロック高時点でのveYMWK残高

---

#### `supplyAt`

```solidity
function supplyAt(
    Point memory point_,
    uint256 t_
) internal view returns (uint256)
```

- 指定したポイントを起点に指定したタイムスタンプ時点での 総veYMWK残高を返す
- 255 週以上ポイントが記録されていない状況の場合は正しい計算ができなくなる

**引数**

| 引数名   | 型        | 概要           | 制約 |
| -------- | --------- | -------------- | ---- |
| `point_` | `Point`   | 起点のポイント | -    |
| `t_`     | `uint256` | タイムスタンプ |      |

**戻り値**

- `uint256`
  - 指定したポイントを起点に指定したタイムスタンプ時点での 総veYMWK残高

---

#### `totalSupply`

```solidity
function totalSupply(uint256 t_) external view returns (uint256)
```

最後に記録されたポイントを起点に、指定したタイムスタンプ時点の総veYMWK残高を返す

**引数**

| 引数名 | 型        | 概要           | 制約 |
| ------ | --------- | -------------- | ---- |
| `t_`   | `uint256` | タイムスタンプ |      |

**戻り値**

- `uint256`
  - 最後に記録されたポイントを起点に、指定したタイムスタンプ時点での 総veYMWK残高

---

#### `totalSupply`

```solidity
function totalSupply() external view returns (uint256)
```

最後に記録されたポイントを起点に、現時点の総veYMWK残高を返す

**戻り値**

- `uint256`
  - 最後に記録されたポイントを起点に、現時点の総veYMWK残高

---

#### `totalSupplyAt`

```solidity
function totalSupplyAt(uint256 block_) external view returns (uint256)
```

指定したブロック高時点での総veYMWK残高を返す

**引数**

| 引数名   | 型        | 概要       | 制約 |
| -------- | --------- | ---------- | ---- |
| `block_` | `uint256` | ブロック高 |      |

**戻り値**

- `uint256`
  - 指定したブロック高時点での総veYMWK残高
