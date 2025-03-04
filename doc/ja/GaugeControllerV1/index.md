# GaugeController

## 概要

GaugeごとのWeightの管理をする

## 親クラス

UUPSBase

## 機能

### 定数

`MULTIPLIER: uint256 constant`

丸め誤差回避用の定数（10 \*\* 18）

### プロパティ

#### `token: address public`

- 排出を制御する対象のトークンアドレスを保持する

#### `votingEscrow: address public`

- VotingEscrowコントラクトのアドレスを保持する

#### Gauge parameters

#### `nGaugeTypes: int128 public`

- Gauge Typeの数を保持する。V1.5では1つのみ

#### `nGauges: int128 public`

- Gaugeの数を保持する。V1.5では1つのみ

#### `gaugeTypeNames: mapping(int128 => string) public`

- Gauge Typeの名称を保持する。V1.5ではveYMWKのみ

#### `gauges: address[1000000000] public`

- Gaugeのアドレスを保持する。V1.5では1つのみ

#### `gaugeTypes_: mapping(address => int128) public`

- GaugeのTypeを保持する

### 関数

#### initialize

```solidity
function initialize(
    address token_,
    address votingEscrow_
) public initializer
```

UUPSUpgradeableのイニシャライザ。

- UUPSBaseの初期化
- adminを設定する
- tokenを設定する
- votingEscrowを設定する
- veYMWKのgaugeTypeを設定する

**引数**

| 引数名          | 型        | 概要                   | 制約            |
| --------------- | --------- | ---------------------- | --------------- |
| `token_`        | `address` | トークンのアドレス     | 0アドレスでない |
| `votingEscrow_` | `address` | VotingEscrowのアドレス | 0アドレスでない |

---

#### gaugeTypes

```solidity
function gaugeTypes(
    address addr_
) external view　returns (int128)
```

GaugeのTypeを取得する。

**引数**

| 引数名  | 型        | 概要                | 制約 |
| ------- | --------- | ------------------- | ---- |
| `addr_` | `address` | 対象のGaugeアドレス | -    |

**戻り値**

- `int128`
  - GaugeのType

---

#### addGauge

```solidity
function addGauge(
    address addr_,
    int128 gaugeType_,
    uint256 weight_
) external onlyAdmin
```

Gaugeを追加する。V1.5では1つのみ追加可能。

**条件**

- 管理者のみ
- 1つのみ

**引数**

| 引数名       | 型        | 概要                | 制約 |
| ------------ | --------- | ------------------- | ---- |
| `addr_`      | `address` | 対象のGaugeアドレス | -    |
| `gaugeType_` | `int128`  | V1.5では使用しない  | -    |
| `weight_`    | `uint256` | V1.5では使用しない  | -    |

---

#### checkpoint

```solidity
function checkpoint() external
```

V1.5では何もしない。

---

#### checkpointGauge

```solidity
function checkpointGauge(
    address addr_
) external
```

V1.5では何もしない。

**引数**

| 引数名  | 型        | 概要               | 制約 |
| ------- | --------- | ------------------ | ---- |
| `addr_` | `address` | V1.5では使用しない | -    |

---

#### gaugeRelativeWeight

```solidity
function gaugeRelativeWeight(
    address addr_,
    uint256 time_
) external pure returns (uint256)
```

V1.5では固定値の `1e18` を返却する。

**引数**

| 引数名  | 型        | 概要               | 制約 |
| ------- | --------- | ------------------ | ---- |
| `addr_` | `address` | V1.5では使用しない | -    |
| `time_` | `uint256` | V1.5では使用しない | -    |

**戻り値**

- `uint256`
  - 固定値 `1e18`
