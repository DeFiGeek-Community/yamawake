# GaugeController

## Overview

A fork of Curve's [GaugeController](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/GaugeController.vy). Manages the weights for each Gauge.

### Main Changes from the Curve Version

- Retained only the minimal necessary functionalities and modified it to be upgradable using UUPSUpgradeable

## Parent class

UUPSBase

## Features

### Constants

`MULTIPLIER: uint256 constant`

- A constant to avoid rounding errors (10 \*\* 18)

### Properties

#### `token: address public`

- Holds the address of the token that controls emissions.

#### `votingEscrow: address public`

- Holds the address of the VotingEscrow contract.

#### Gauge Parameters

#### `nGaugeTypes: int128 public`

- Holds the number of Gauge Types. Only one in V1.5.

#### `nGauges: int128 public`

- Holds the number of Gauges. Only one in V1.5.

#### `gaugeTypeNames: mapping(int128 => string) public`

- Holds the names of the Gauge Types. Only veYMWK in V1.5.

#### `gauges: address[1000000000] public`

- Holds the addresses of Gauges. Only one in V1.5.

#### `gaugeTypes_: mapping(address => int128) public`

- Holds the Type of the Gauges.

### Functions

#### initialize

```solidity
function initialize(
    address token_,
    address votingEscrow_
) public initializer
```

Initializer for UUPSUpgradeable.

- Initializes `UUPSBase`.
- Sets `admin`.
- Sets `token`.
- Sets `votingEscrow`.
- Sets the gauge type for veYMWK.

**Parameters**

| Parameter Name  | Type      | Description             | Constraints              |
| --------------- | --------- | ----------------------- | ------------------------ |
| `token_`        | `address` | Address of the token    | Must not be zero address |
| `votingEscrow_` | `address` | Address of VotingEscrow | Must not be zero address |

---

#### gaugeTypes

```solidity
function gaugeTypes(
    address addr_
) external view returns (int128)
```

Gets the Type of a Gauge.

**Parameters**

| Parameter Name | Type      | Description          | Constraints |
| -------------- | --------- | -------------------- | ----------- |
| `addr_`        | `address` | Address of the Gauge | -           |

**Returns**

- `int128`
  - Type of the Gauge

---

#### addGauge

```solidity
function addGauge(
    address addr_,
    int128 gaugeType_,
    uint256 weight_
) external onlyAdmin
```

Adds a Gauge. Only one can be added in V1.5.

**Conditions**

- Admin only
- Only one Gauge allowed

**Parameters**

| Parameter Name | Type      | Description          | Constraints |
| -------------- | --------- | -------------------- | ----------- |
| `addr_`        | `address` | Address of the Gauge | -           |
| `gaugeType_`   | `int128`  | Not used in V1.5     | -           |
| `weight_`      | `uint256` | Not used in V1.5     | -           |

---

#### checkpoint

```solidity
function checkpoint() external
```

Does nothing in V1.5.

---

#### checkpointGauge

```solidity
function checkpointGauge(
    address addr_
) external
```

Does nothing in V1.5.

**Parameters**

| Parameter Name | Type      | Description      | Constraints |
| -------------- | --------- | ---------------- | ----------- |
| `addr_`        | `address` | Not used in V1.5 | -           |

---

#### gaugeRelativeWeight

```solidity
function gaugeRelativeWeight(
    address addr_,
    uint256 time_
) external pure returns (uint256)
```

Returns a fixed value of `1e18` in V1.5.

**Parameters**

| Parameter Name | Type      | Description      | Constraints |
| -------------- | --------- | ---------------- | ----------- |
| `addr_`        | `address` | Not used in V1.5 | -           |
| `time_`        | `uint256` | Not used in V1.5 | -           |

**Returns**

- `uint256`
  - Fixed value `1e18`

---
