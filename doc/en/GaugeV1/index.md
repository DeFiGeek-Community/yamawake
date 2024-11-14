# Gauge

## Overview

Calculates and maintains [YMWK Token](../YamawakeToken/index.md) rewards for [veYMWK](../VotingEscrow/index.md) holders.

Parent class: UUPSBase

## Features

### Constants

`WEEK: uint256 public constant`

- Number of seconds in one week (7 × 86400)

### Properties

#### `startTime: int256 public`

- Timestamp at the beginning of the week when token distribution starts

#### `token: address public`

- Holds the address of the YMWK token

#### `votingEscrow: address public`

- Holds the address of the VotingEscrow

#### `minter: address public`

- Holds the address of the Minter

#### `gaugeController: address public`

- Holds the address of the GaugeController

#### `admin: address public`

- Holds the admin address

#### `futureEpochTime: uint256 public`

- Holds the timestamp of the next inflation rate change

#### `inflationRate: uint256 public`

- Holds the inflation rate of YMWK

#### `timeCursor: uint256 public`

- Holds the timestamp at the beginning of the week when the next `checkpointTotalSupply` will start ve synchronization

#### `tokenTimeCursor: uint256 public`

- Holds the timestamp at the beginning of the week when the next `checkpointToken` will start aggregating weekly token rewards

#### `isKilled: uint256 public`

- Kill state flag: `0` -> Normal state, `1` -> Killed state

#### `timeCursorOf: mapping(address => uint256) public`

- For each user, holds the timestamp at the beginning of the week when reward calculation will start in the next `userCheckpoint`

#### `userEpochOf: mapping(address => uint256) public`

- For each user, holds the latest epoch number where ve synchronization is complete

#### `tokensPerWeek: mapping(uint256 => uint256) public`

- Holds the reward amounts (the right to mint YMWK allocated to this Gauge) per week

#### `veSupply: mapping(uint256 => uint256) public`

- Holds the total veYMWK balance per week

#### `integrateFraction: mapping(address => uint256) public`

- Holds the cumulative YMWK reward amount allocated to each user

  - Calculated as: Weight × YMWK issuance per week × User's ve balance at the beginning of each week / Total ve balance at the beginning of each week

YMWK reward amount up to week N:

$$
\sum_{n=0}^{N-1} \left( \int_{t_n}^{t_{n+1}} r(t) dt \cdot w(t_n) \cdot \frac{b_u(t_n)}{S(t_n)} \right)
$$

Where:

- $W$: 604800 (seconds in a week)
- $r(t)$: YMWK issuance rate per unit time
- $w(t)$: Weight at time $t$
- $S(t)$: Total ve balance at time $t$
- $b_u(t)$: User's ve balance at time $t$
- $t_0$: Timestamp when reward distribution starts
- $t_n$: Timestamp at the beginning of week $n$ ($t_0 + W \cdot n$)

### Functions

#### initializer

```solidity
function initialize(
    address minter_,
    uint256 startTime_
) public initializer
```

- Initializes `UUPSBase`
- Sets `minter`
- Sets `token`
- Sets `gaugeController`
- Sets `votingEscrow`
- Retrieves and sets `inflationRate` from `token`
- Retrieves and sets `futureEpochTime` from `token`
- Calculates and sets `startTime` to the beginning of the week of the given `startTime_`
- Sets `tokenTimeCursor` to the beginning of the week of `startTime_`
- Sets `timeCursor` to the beginning of the week of `startTime_`

**Parameters**

| Name         | Type      | Description                 | Constraints |
| ------------ | --------- | --------------------------- | ----------- |
| `minter_`    | `address` | Address of the `minter`     | -           |
| `startTime_` | `uint256` | Timestamp at initialization | -           |

---

#### \_checkpointToken

```solidity
function _checkpointToken() internal
```

Calculates the YMWK reward amounts allocated to this Gauge over a maximum of 20 weeks from the `tokenTimeCursor`, records them per week in `tokensPerWeek`. If the calculation up to the previous week is completed at the time of execution, it ends.

---

#### checkpointToken

```solidity
function checkpointToken() external
```

Executes `_checkpointToken`.

**Conditions**

- Only executable by the admin, or if the week of execution is past the week of `tokenTimeCursor`

---

#### \_findTimestampEpoch

```solidity
function _findTimestampEpoch(
    address ve_,
    uint256 timestamp_
) internal view returns (uint256)
```

Searches the `pointHistory` of the VotingEscrow based on the timestamp and returns the epoch number that was created closest before the timestamp.

**Parameters**

| Name         | Type      | Description                 | Constraints |
| ------------ | --------- | --------------------------- | ----------- |
| `ve_`        | `address` | Address of the VotingEscrow | -           |
| `timestamp_` | `uint256` | Target timestamp to search  | -           |

**Returns**

- `uint256`
  - Epoch number immediately before the specified timestamp

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

Searches the `pointHistory` of the VotingEscrow for the user based on the timestamp and returns the user epoch number that was created closest before the timestamp.

**Parameters**

| Name            | Type      | Description                      | Constraints |
| --------------- | --------- | -------------------------------- | ----------- |
| `ve_`           | `address` | Address of the VotingEscrow      | -           |
| `user_`         | `address` | User to search                   | -           |
| `timestamp_`    | `uint256` | Target timestamp to search       | -           |
| `maxUserEpoch_` | `uint256` | Maximum epoch number of the user | -           |

**Returns**

- `uint256`
  - User epoch number immediately before the specified timestamp

---

#### veForAt

```solidity
function veForAt(
    address user_,
    uint256 timestamp_
) external view returns (uint256)
```

Returns the user's ve balance at the specified timestamp.

**Parameters**

| Name         | Type      | Description               | Constraints |
| ------------ | --------- | ------------------------- | ----------- |
| `user_`      | `address` | User to query             | -           |
| `timestamp_` | `uint256` | Target timestamp to query | -           |

**Returns**

- `uint256`
  - User's veYMWK balance at the specified timestamp

---

#### \_checkpointTotalSupply

```solidity
function _checkpointTotalSupply() internal
```

Executes the `checkpoint` of the VotingEscrow and records the veYMWK balance history at the beginning of each week for up to the past 20 weeks.

---

#### checkpointTotalSupply

```solidity
function checkpointTotalSupply() external
```

Executes `_checkpointTotalSupply`.

---

#### \_checkpoint

```solidity
function _checkpoint(
    address addr_
) internal
```

Calculates the reward amount for the specified user.

- If the current time is past the week since the last veYMWK total supply update:
  - Calls `_checkpointTotalSupply` to update the veYMWK total supply history
- If the current time is past the week since the last completed reward calculation:
  - Calls `_checkpointToken` to calculate rewards for weeks not yet calculated
- If the user has no ve history:
  - Ends the function
- From the `timeCursorOf` week to the week where veYMWK total supply synchronization and YMWK reward calculation are complete, calculates the reward amount allocated to the user per week
- Records the user epoch
- Updates the cumulative reward amount

**Conditions**

- `block.timestamp` is greater than or equal to `timeCursor`

**Parameters**

| Name    | Type      | Description         | Constraints |
| ------- | --------- | ------------------- | ----------- |
| `addr_` | `address` | Address of the user | -           |

---

#### userCheckpoint

```solidity
function userCheckpoint(
    address addr_
) external returns (bool)
```

Executes `_checkpoint`.

**Conditions**

- Only the `addr_` user themselves or the `minter` can execute

**Parameters**

| Name    | Type      | Description         | Constraints |
| ------- | --------- | ------------------- | ----------- |
| `addr_` | `address` | Address of the user | -           |

**Returns**

- `bool`
  - `true`

---

#### setKilled

```solidity
function setKilled(
    bool isKilled_
) external onlyAdmin
```

Kills this Gauge. In the killed state, the YMWK inflation is treated as zero, and no more rewards accumulate.

**Conditions**

- Admin only

**Parameters**

| Name        | Type   | Description       | Constraints |
| ----------- | ------ | ----------------- | ----------- |
| `isKilled_` | `bool` | Kill state on/off | -           |

---

#### claimableTokens

```solidity
function claimableTokens(
    address addr_
) external returns (uint256)
```

Returns the amount of YMWK rewards that the specified user can currently claim.

**Parameters**

| Name    | Type      | Description         | Constraints |
| ------- | --------- | ------------------- | ----------- |
| `addr_` | `address` | Address of the user | -           |

**Returns**

- `uint256`
  - Claimable reward amount

---

## References

### YMWK Reward Simple Simulation

https://www.desmos.com/calculator/9qm15hlyjq

### Curve Contracts

- [Curve Liquidity Gauge](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)
- [Curve Fee Distributor](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/FeeDistributor.vy)
