# FeeDistributorV1

## 概要

オークションの手数料をveYMWKホルダーに報酬として分配する。UUPSでアップグレーダブル

## 機能

### 定数

`WEEK: uint256 public constant`

一週間の秒数（7 \* 86400）

### プロパティ

#### `factory: address public`

- Factoryのアドレスを保持する

#### `timeCursor: uint256 public`

- ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する

#### `lastCheckpointTotalSupplyTime: uint256 public`

- 最後にveのtotalSupplyを同期したタイムスタンプを保持する

#### `timeCursorOf: mapping(address => mapping(address => uint256)) public`

- ユーザごと、トークンごとに報酬のクレームが完了している週の次週頭（WEEKの倍数）のタイムスタンプを保持する

#### `userEpochOf: mapping(address => mapping(address => uint256)) public `

- ユーザごと、トークンごとにVotingEscrowのuserPointHistoryと同期が完了しているエポック数を保持する

#### `lastTokenTime: mapping(address => uint256) public`

- チェックポイント時点のタイムスタンプをトークンごとに保持する

#### `startTime: uint256 public`

- 報酬の分配を開始するタイムスタンプを保持する

#### `tokensPerWeek: mapping(address => mapping(uint256 => uint256)) public`

- 報酬額を週ごと、トークン種別ごとに保持する

#### `votingEscrow: address public `

- VotingEscrowのアドレスを保持する

#### `tokens: address[] public`

- 報酬トークンのアドレスを保持する
- 0x0はeth

#### `tokenFlags: mapping(address => uint256) public`

- トークンのアドレスが報酬トークンとして登録されているかのフラグを保持する
- 0 -> 未登録, 1 -> 登録済み
- address 0x0はeth

#### `tokenLastBalance: mapping(address => uint256) public`

- チェックポイント時点の残高をトークンごとに保持する

#### `veSupply: mapping(uint256 => uint256) public`

- veYMWK総残高を週ごとに保持する

#### `isKilled: bool public`

- killed / not killed の状態を保持する

### 関数

#### initializer

```solidity
initialize(
    address votingEscrow_,
    address factory_,
    uint256 startTime_
) public initializer
```

startTimeを引数で与えられた `startTime_` の週始めのタイムスタンプに設定し、以下の初期設定を行う。

- UUPSBaseの初期化
- ReentrancyGuardの初期化
- eth の `lastTokenTime` を `startTime_` の週始めのタイムスタンプに設定
- `timeCursor` を `startTime_` の週始めのタイムスタンプに設定
- `tokens` に eth アドレス（`0x0`）を追加
- `tokenFlags` の eth アドレス（`0x0`）を `true` に設定
- `votingEscrow` を設定
- `factory` を設定
- `admin` を `msg.sender` に設定

**引数**

| 引数名          | 型        | 概要                               | 制約 |
| --------------- | --------- | ---------------------------------- | ---- |
| `votingEscrow_` | `address` | VotingEscrowのアドレス             | -    |
| `factory_`      | `address` | Factoryのアドレス                  | -    |
| `startTime_`    | `uint256` | 報酬の分配を開始するタイムスタンプ | -    |

---

#### \_checkpointToken

```solidity
function _checkpointToken(
    address address_
) internal
```

実行された時点の指定トークン残高と前回チェックポイント時の残高の差額を、前回チェックポイントからの経過時間で割り、各週ごとに分配する。前回チェックポイントから週を跨ぐ場合は、前回チェックポイントの翌週分から分配を開始する。前回チェックポイントから20週間以上が経過している場合は、今回チェックポイント週を含め過去20週間に対して分配する。

**引数**

| 引数名     | 型        | 概要                   | 制約 |
| ---------- | --------- | ---------------------- | ---- |
| `address_` | `address` | 報酬トークンのアドレス | -    |

---

#### checkpointToken

```solidity
function checkpointToken(
    address address_
) external onlyAdminOrAuction
```

`_checkpointToken` を実行する。

**条件**

- `address_` が tokenFlags に登録されていること
- 管理者またはオークションのみ実行可能

**引数**

| 引数名     | 型        | 概要                   | 制約 |
| ---------- | --------- | ---------------------- | ---- |
| `address_` | `address` | 報酬トークンのアドレス | -    |

---

#### \_findTimestampEpoch

```solidity
function _findTimestampEpoch(
    address ve_,
    uint256 timestamp_
) internal view returns (uint256)
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

タイムスタンプから VotingEscrow のユーザ `pointHistory` を検索し、タイムスタンプより過去に作成された一番近いユーザエポック数を返却する。

**引数**

| 引数名          | 型        | 概要                     | 制約 |
| --------------- | --------- | ------------------------ | ---- |
| `ve_`           | `address` | VotingEscrow のアドレス  | -    |
| `user_`         | `address` | 検索対象のユーザ         | -    |
| `timestamp_`    | `uint256` | 検索対象のタイムスタンプ | -    |
| `maxUserEpoch_` | `uint256` | 最大ユーザエポック数     | -    |

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

VotingEscrow の `checkpoint` を実行した上で、過去最大20週間分の各週始め時点での veYMWK 残高履歴を記録する。

---

#### checkpointTotalSupply

```solidity
function checkpointTotalSupply() external
```

`_checkpointTotalSupply` を実行する。

---

#### \_claim

```solidity
function _claim(
    address addr_,
    address token_,
    address ve_,
    uint256 lastTokenTime_
) internal returns (uint256)
```

指定ユーザの指定トークン報酬額を、実行時点の前週分まで計算する。以前の実行からのユーザエポック数 + 経過週が50以上の場合は前週分までの計算のために複数回の呼び出しが必要

| 引数名            | 型      | 概要                                             | 制約                  |
| ----------------- | ------- | ------------------------------------------------ | --------------------- |
| addr\_            | address | 対象ユーザのアドレス                             | 0 アドレスでないこと  |
| token\_           | address | 報酬トークンのアドレス                           | -                     |
| ve\_              | address | VotingEscrowのアドレス                           | 0 アドレスでないこと- |
| last_token_time\_ | uint256 | トークンの最後のチェックポイントのタイムスタンプ | -                     |

#### 戻り値

- `_amount`
  - 指定トークンの報酬額

---

#### claim

```solidity
function claim(
    address token_
) external nonReentrant returns (uint256)
```

`msg.sender` に対して報酬をクレームする。`view` 関数として実行することでクレーム可能な報酬額を取得する。

**条件**

- kill状態でない
- 対象トークンが `tokens` に登録済みであること

##### 引数

| 引数名  | 型      | 概要                   | 制約 |
| ------- | ------- | ---------------------- | ---- |
| token\_ | address | 報酬トークンのアドレス | -    |

##### 戻り値

- `_amount`
  - 指定トークンの報酬額

---

#### claim

```solidity
function claim(
    address addr_,
    address token_
) external nonReentrant returns (uint256)
```

指定のアドレスの報酬をクレームする。`view` 関数として実行することでクレーム可能な報酬額を取得する。

**条件**

- kill状態でない
- 対象トークンが `tokens` に登録済みであること

**引数**

| 引数名   | 型        | 概要                   | 制約 |
| -------- | --------- | ---------------------- | ---- |
| `addr_`  | `address` | 対象ユーザのアドレス   | -    |
| `token_` | `address` | 報酬トークンのアドレス | -    |

**戻り値**

- `_amount`
  - 指定トークンの報酬額

---

#### claimMany

```solidity
function claimMany(
    address[] receivers_,
    address token_
) external nonReentrant returns (bool)
```

複数のアドレスの報酬をまとめてクレームする。

**条件**

- kill状態でない
- 対象トークンが `tokens` に登録済みであること

**引数**

| 引数名       | 型          | 概要                     | 制約 |
| ------------ | ----------- | ------------------------ | ---- |
| `receivers_` | `address[]` | 対象ユーザのアドレス配列 | -    |
| `token_`     | `address`   | 報酬トークンのアドレス   | -    |

---

#### claimMultipleTokens

```solidity
function claimMultipleTokens(
    address addr_,
    address[20] tokens_
) external nonReentrant returns (bool)
```

複数のトークン報酬をまとめてクレームする。

**条件**

- kill状態でない
- 対象トークンが `tokens` に登録済みであること

**引数**

| 引数名    | 型            | 概要                       | 制約                         |
| --------- | ------------- | -------------------------- | ---------------------------- |
| `addr_`   | `address`     | 対象ユーザのアドレス       | -                            |
| `tokens_` | `address[20]` | 報酬トークンのアドレス配列 | 最大20トークンまで（要検討） |

---

#### killMe

```solidity
function killMe() external onlyAdmin
```

kill状態を `True` に変更し、Ether残高をAdminに送金する。

**条件**

- adminのみ

---

#### recoverBalance

```solidity
function recoverBalance(
    address coin_
) external onlyAdmin returns (bool)
```

指定トークンを全額Adminに送金する。

**条件**

- adminのみ
- 対象トークンが `tokens` に登録済みであること

**引数**

| 引数名  | 型        | 概要               | 制約 |
| ------- | --------- | ------------------ | ---- |
| `coin_` | `address` | トークンのアドレス | -    |

**戻り値**

- `bool`
  - 処理の成否を示す

---

#### addRewardToken

```solidity
function addRewardToken(
    address coin_
) external onlyAdminOrAuction returns (bool)
```

指定したトークンを報酬トークンとして追加する。

**条件**

- Auction、adminのみ

**引数**

| 引数名  | 型        | 概要               | 制約 |
| ------- | --------- | ------------------ | ---- |
| `coin_` | `address` | トークンのアドレス | -    |

**戻り値**

- `bool`
  - 処理の成否を示す

---

#### getTokens

```solidity
function getTokens() external view returns (address[])
```

登録されているトークンのアドレス配列を取得する。

**戻り値**

- `address[]`
  - トークンのアドレス配列

---

## 参考

### Curve Contracts

[Curve Liquidity Gauge](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

[Curve Fee Distributor](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/FeeDistributor.vy)
