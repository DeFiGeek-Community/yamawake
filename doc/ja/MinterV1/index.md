# TokenMinter

## 概要

Curveの[TokenMinter](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/Minter.vy)のフォーク。

ユーザからミントのリクエストを受け、ミント可能額をGaugeから取得し、YMWKトークンをミントする

### Curve版からの主な変更点

- UUPSUpgradableを継承しアップグレーダブルに変更

## 親クラス

UUPSBase, ReentrancyGuardUpgradeable

## 機能

### プロパティ

#### `token: address public`

トークンアドレスを保持する

#### `controller: address public`

GaugeControllerアドレスを保持する

#### `minted: mapping(address => mapping(address => uint256)) public`

ユーザごと、GaugeごとにYMWKミント済み額を保持する

#### `allowedToMintFor: mapping(address => mapping(address => bool)) public`

ミンターアドレスごとに指定アドレスへの代替ミント可否フラグを保持する

## 関数

#### initializer

```solidity
function initialize(
    address token_,
    address controller_
) public initializer
```

- UUPSBaseを初期化する
- ReentrancyGuardを初期化する
- `token` を設定する。
- `controller` を設定する。

**引数**

| 引数名        | 型        | 概要                     | 制約 |
| ------------- | --------- | ------------------------ | ---- |
| `token_`      | `address` | トークンのアドレス       | -    |
| `controller_` | `address` | コントローラーのアドレス | -    |

---

#### \_mintFor

```solidity
function _mintFor(
    address gaugeAddr_,
    address for_
) internal
```

指定アドレスに対して指定Gauge分のトークンをミントする。

**条件**

- `gaugeAddr_` が `controller` に登録されていること

**引数**

| 引数名       | 型        | 概要                     | 制約 |
| ------------ | --------- | ------------------------ | ---- |
| `gaugeAddr_` | `address` | 対象Gaugeのアドレス      | -    |
| `for_`       | `address` | ミントを実行するアドレス | -    |

---

#### mint

```solidity
function mint(
    address gaugeAddr_
) external nonReentrant
```

`msg.sender` に対して指定Gaugeのミント可能額分トークンをミントする。

**引数**

| 引数名       | 型        | 概要                | 制約 |
| ------------ | --------- | ------------------- | ---- |
| `gaugeAddr_` | `address` | 対象Gaugeのアドレス | -    |

---

#### mintMany

```solidity
function mintMany(
    address[8] gaugeAddrs_
) external nonReentrant
```

`msg.sender` に対して指定Gaugeのミント可能額分トークンをミントする。

**引数**

| 引数名        | 型           | 概要                    | 制約 |
| ------------- | ------------ | ----------------------- | ---- |
| `gaugeAddrs_` | `address[8]` | 対象Gaugeのアドレス配列 | -    |

---

#### mintFor

```solidity
function mintFor(
    address gaugeAddr_,
    address for_
) external nonReentrant
```

指定アドレスに対して指定Gauge分のトークンをミントする。

**条件**

- `msg.sender` が `for_` に対してのミントを許可されている（`allowedToMintFor` が `true`）

**引数**

| 引数名       | 型        | 概要                     | 制約 |
| ------------ | --------- | ------------------------ | ---- |
| `gaugeAddr_` | `address` | 対象Gaugeのアドレス      | -    |
| `for_`       | `address` | ミントを実行するアドレス | -    |

---

#### toggleApproveMint

```solidity
function toggleApproveMint(
    address mintingUser_
) external
```

指定アドレスに対して `msg.sender` の代わりにミントすることを許可する。

**引数**

| 引数名         | 型        | 概要                         | 制約 |
| -------------- | --------- | ---------------------------- | ---- |
| `mintingUser_` | `address` | 代替ミントを許可するアドレス | -    |

---
