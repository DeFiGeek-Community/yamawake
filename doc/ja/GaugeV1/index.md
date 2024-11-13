# Gauge

## 概要

[veYMWK](../VotingEscrow/index.md)ホルダーに対する[YMWKトークン](../YamawakeToken/index.md)報酬を計算・保持する。

親クラス: UUPSBase

## 機能

### 定数

`WEEK: uint256 public constant`

一週間の秒数（7 \* 86400）

### プロパティ

#### `startTime: int256 public`

トークンの配布を開始する週頭のタイムスタンプ

#### `token: address public`

YMWKトークンのアドレスを保持する

#### `votingEscrow: address public`

VotingEscrowのアドレスを保持する

#### `minter: address public`

ミンターのアドレスを保持する

#### `gaugeController: address public`

ゲージコントローラーのアドレスを保持する

#### `admin: address public`

管理者アドレスを保持する

#### `futureEpochTime: uint256 public`

次回のインフレーションレート変更タイムスタンプを保持する

#### `inflationRate: uint256 public`

YMWKのインフレーションレートを保持する

#### `timeCursor: uint256 public`

次回checkpointTotalSupplyでve同期を開始する週頭のタイムスタンプを保持する

#### `tokenTimeCursor: uint256 public`

次回checkpointTokenで週ごとのトークン報酬の集計を開始する週頭のタイムスタンプを保持する

#### `isKilled: uint256 public`

kill状態フラグ。 0 -> 通常状態, 1 -> kill状態

#### `timeCursorOf: mapping(address => uint256) public`

ユーザごとの、次回のuserCheckpoint時に報酬の計算を開始する週頭のタイムスタンプを保持する

#### `userEpochOf: mapping(address => uint256) public`

ユーザごとの、ve同期が完了している最新のエポック数を保持する

#### `tokensPerWeek: mapping(uint256 => uint256) public`

報酬額（このGaugeに割当てられるYMWKのMint権利）を週ごとに保持する

#### `veSupply: mapping(uint256 => uint256) public`

veYMWK総残高を週ごとに保持する

#### `integrateFraction: mapping(address => uint256) public`

ユーザごとに割当てられるYMWK報酬額の累計を保持する

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

#### initializer

```solidity
function initialize(
    address minter_,
    uint256 startTime_
) public initializer
```

- UUPSBaseを初期化する
- `minter` を設定する
- `token` を設定する
- `gaugeController` を設定する
- `votingEscrow` を設定する
- `inflationRate` を `token` から取得し、設定する
- `futureEpochTime` を `token` から取得し、設定する
- `startTime` に `startTime_` で与えられたタイムスタンプの週の頭を計算し設定する
- `tokenTimeCursor` に `startTime_` で与えられたタイムスタンプの週の頭を計算し設定する
- `timeCursor` に `startTime_` で与えられたタイムスタンプの週の頭を計算し設定する

**引数**

| 引数名       | 型        | 概要                     | 制約 |
| ------------ | --------- | ------------------------ | ---- |
| `minter_`    | `address` | `minter` のアドレス      | -    |
| `startTime_` | `uint256` | 初期化時のタイムスタンプ | -    |

---

#### \_checkpointToken

```solidity
function _checkpointToken() internal
```

`tokenTimeCursor` 時点から最大20週間分に渡り、この Gauge に割り振られる YMWK 報酬額を、各週ごとに計算し、`tokensPerWeek`に記録する。
実行された時点の前週分までの計算が完了した場合は終了する。

---

#### checkpointToken

```solidity
function checkpointToken() external
```

`_checkpointToken` を実行する。

**条件**

- 管理者、または実行時の週が `tokenTimeCursor` の週を過ぎていること

---

#### \_findTimestampEpoch

```solidity
function _findTimestampEpoch(
    address ve_,
    uint256 timestamp_
) internal view　returns (uint256)
```

タイムスタンプから VotingEscrow の `pointHistory` を検索し、タイムスタンプより過去に作成された一番近いエポック数を返却する。

**引数**

| 引数名       | 型        | 概要                     | 制約 |
| ------------ | --------- | ------------------------ | ---- |
| `ve_`        | `address` | VotingEscrow のアドレス  | -    |
| `timestamp_` | `uint256` | 検索対象のタイムスタンプ | -    |

**戻り値**

- `uint256`
  - 指定タイムスタンプ直前のエポック数

---

#### \_findTimestampUserEpoch

```solidity
function _findTimestampUserEpoch(
    address ve_,
    address user_,
    uint256 timestamp_,
    uint256 maxUserEpoch_
) internal view returns (uint256)
```

タイムスタンプから VotingEscrow の `pointHistory` を検索し、タイムスタンプより過去に作成された一番近いユーザエポック数を返却する。

**引数**

| 引数名          | 型        | 概要                     | 制約 |
| --------------- | --------- | ------------------------ | ---- |
| `ve_`           | `address` | VotingEscrow のアドレス  | -    |
| `user_`         | `address` | 検索対象のユーザ         | -    |
| `timestamp_`    | `uint256` | 検索対象のタイムスタンプ | -    |
| `maxUserEpoch_` | `uint256` | ユーザの最大エポック数   | -    |

**戻り値**

- `uint256`
  - 指定タイムスタンプ直前のユーザエポック数

---

#### veForAt

```solidity
function veForAt(
    address user_,
    uint256 timestamp_
) external view returns (uint256)
```

指定のタイムスタンプ時点でのユーザの ve 残高を返す。

**引数**

| 引数名       | 型        | 概要                     | 制約 |
| ------------ | --------- | ------------------------ | ---- |
| `user_`      | `address` | 検索対象のユーザ         | -    |
| `timestamp_` | `uint256` | 検索対象のタイムスタンプ | -    |

**戻り値**

- `uint256`
  - 指定タイムスタンプ時点でのユーザ veYMWK 残高

---

#### \_checkpointTotalSupply

```solidity
function _checkpointTotalSupply() internal
```

VotingEscrow の `checkpoint` を実行した上で、過去最大20週間分の各週初め時点での veYMWK 残高履歴を記録する。

---

#### checkpointTotalSupply

```solidity
function checkpointTotalSupply() external
```

`_checkpointTotalSupply` を実行する。

---

#### \_checkpoint

```solidity
function _checkpoint(
    address addr_
) internal
```

指定ユーザの報酬額を計算する。

- 実行時点が、前回の veYMWK 総残高更新から週を跨いでいる場合
  - `_checkpointTotalSupply` を呼んで veYMWK 総残高の履歴を更新
- 実行時点が、報酬の計算が完了している最後の週から週を跨いでいる場合
  - `_checkpointToken` を呼んで、計算が完了していない週の報酬を計算
- ユーザに ve の履歴がない場合
  - 終了
- `timeCursorOf` の週から veYMWK 総残高の同期と YMWK 報酬の計算が完了している週まで、週ごとにユーザに割り当てられる報酬額を計算する
- ユーザエポックを記録する
- 報酬額の累計を更新する

**条件**
`block.timestamp`が`timeCursor`以上

**引数**

| 引数名  | 型        | 概要                 | 制約 |
| ------- | --------- | -------------------- | ---- |
| `addr_` | `address` | 対象ユーザのアドレス | -    |

---

#### userCheckpoint

```solidity
function userCheckpoint(
    address addr_
) external returns (bool)
```

`_checkpoint` を実行する。

**条件**

- `addr_` 本人または `minter`

**引数**

| 引数名  | 型        | 概要                 | 制約 |
| ------- | --------- | -------------------- | ---- |
| `addr_` | `address` | 対象ユーザのアドレス | -    |

**戻り値**

- `bool`
  - `true`

---

#### setKilled

```solidity
function setKilled(
    bool isKilled_
) external onlyAdmin
```

この Gauge を kill する。kill 状態では YMWK インフレーションが 0 として扱われ、これ以上報酬が蓄積されない。

**条件**

- 管理者のみ

**引数**

| 引数名      | 型     | 概要               | 制約 |
| ----------- | ------ | ------------------ | ---- |
| `isKilled_` | `bool` | kill 状態の on/off | -    |

---

#### claimableTokens

```solidity
function claimableTokens(
    address addr_
) external returns (uint256)
```

指定ユーザが現在クレーム可能な YMWK 報酬額を返す。

**引数**

| 引数名  | 型        | 概要                 | 制約 |
| ------- | --------- | -------------------- | ---- |
| `addr_` | `address` | 対象ユーザのアドレス | -    |

**戻り値**

- `uint256`
  - クレーム可能な報酬額

---

## 参考

### YMWK報酬簡易シミュレーション

https://www.desmos.com/calculator/9qm15hlyjq

### Curve Contracts

[Curve Liquidity Gauge](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

[Curve Fee Distributor](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/FeeDistributor.vy)
