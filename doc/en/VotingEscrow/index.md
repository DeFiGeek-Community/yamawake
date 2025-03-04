# VotingEscrow

## Overview

Locks YMWK tokens and issues non-transferable veYMWK tokens.

The lock period is up to 4 years, with a minimum unit of 1 week. veYMWK decays linearly over time after locking. Locking 1 YMWK for 4 years issues 1 veYMWK.

#### References

- [Simulation of YMWK Reward Allocation Amount for veYMWK Holders](https://www.desmos.com/calculator/uslkumq90d?lang=ja)

## Features

### Structs

#### `Point`

A struct for storing the state of veYMWK at a specific point in time.

- `bias (int128)`
  - veYMWK balance
- `slope (int128)`
  - The rate at which veYMWK decreases; calculated as lock amount divided by the maximum lock period.
- `ts (uint256)`
  - Timestamp
- `blk (uint256)`
  - Block number

#### `LockedBalance`

A struct for storing lock information.

- `amount (int128)`
  - Lock amount
- `end (uint256)`
  - Timestamp when the lock ends

### Constants

#### `DEPOSIT_FOR_TYPE: int128`

For event identification.

#### `CREATE_LOCK_TYPE: int128`

For event identification.

#### `INCREASE_LOCK_AMOUNT: int128`

For event identification.

#### `INCREASE_UNLOCK_TIME: int128`

For event identification.

#### `WEEK: uint256`

One week (7 × 86400 seconds)

#### `MAXTIME: uint256`

Four years (4 × 365 × 86400 seconds)

#### `MULTIPLIER: uint256`

A constant (10^18) used to prevent rounding errors during division.

### Properties

#### `token: address public`

The address of the token to be locked (assumed to be the YMWK contract address).

#### `supply: uint256 public`

Total locked amount of the token. Changes upon deposit and withdrawal.

#### `locked: mapping(address => LockedBalance) public`

Stores token lock information (amount and end timestamp) for each user.

#### `epoch: uint256 public`

A global index incremented with every action by any user.

#### `pointHistory: mapping(uint256 => Point) public`

An array recording the global state of veYMWK at each epoch.

#### `userPointHistory: mapping(address => mapping(uint256 => Point)) public`

An array recording the state of veYMWK for each user at each user epoch.

#### `userPointEpoch: mapping(address => uint256) public`

A local index incremented with each action of a user.

#### `slopeChanges: mapping(uint256 => int128) public`

Records the scheduled changes in slope at specific times. Updated when a user deposits or changes their lock period. The key is a timestamp aligned to weeks (multiple of `WEEK`). If there is a slope change scheduled at the time of a user's action, this change is applied to the slope of the `Point`.

#### `depositForAllowed: mapping(address => mapping(address => bool)) public`

Maintains addresses that are allowed to deposit on behalf of others. depositor -> user -> allowed

#### `depositForAllAllowed: mapping(address => bool) public`

Stores a flag indicating whether a user allows deposits from all addresses. user -> all allowed

#### `name: string public`

Name of the veYMWK token.

#### `symbol: string public`

Symbol of the veYMWK token.

#### `version: string public`

Version of the veYMWK token.

#### `decimals: uint256 public`

Decimals of the veYMWK token.

### Functions

#### Initialization

```solidity
constructor(
    address tokenAddr_,
    string memory name_,
    string memory symbol_
)
```

- Sets `token` to `tokenAddr_`.
- Sets `pointHistory[0].blk` to `block.number`.
- Sets `pointHistory[0].ts` to `block.timestamp`.
- Sets `transfersEnabled` to `True`.
- Sets `decimals` to the same value as the decimals of `token`.
- Sets `name` to `name_`.
- Sets `symbol` to `symbol_`.

**Parameters**

| Name         | Type      | Description                       | Constraints |
| ------------ | --------- | --------------------------------- | ----------- |
| `tokenAddr_` | `address` | Address of the token to be locked | -           |
| `name_`      | `string`  | Token name                        | -           |
| `symbol_`    | `string`  | Token symbol                      | -           |

---

#### `getLastUserSlope`

```solidity
function getLastUserSlope(address addr_) external view returns (int128)
```

Returns the latest slope of the specified address.

**Parameters**

| Name    | Type      | Description         | Constraints |
| ------- | --------- | ------------------- | ----------- |
| `addr_` | `address` | Address of the user | -           |

**Returns**

- `int128`
  - Latest slope of the specified address

---

#### `userPointHistoryTs`

```solidity
function userPointHistoryTs(
    address addr_,
    uint256 idx_
) external view returns (uint256)
```

Returns the timestamp at the specified index (user epoch) for the specified address.

**Parameters**

| Name    | Type      | Description         | Constraints |
| ------- | --------- | ------------------- | ----------- |
| `addr_` | `address` | Address of the user | -           |
| `idx_`  | `uint256` | User epoch          | -           |

**Returns**

- `uint256`
  - Timestamp at the specified user epoch for the specified address

---

#### `lockedEnd`

```solidity
function lockedEnd(address addr_) external view returns (uint256)
```

Returns the lock end timestamp of the specified address.

**Parameters**

| Name    | Type      | Description         | Constraints |
| ------- | --------- | ------------------- | ----------- |
| `addr_` | `address` | Address of the user | -           |

**Returns**

- `uint256`
  - Lock end timestamp of the specified address

---

#### `_checkpoint`

```solidity
function _checkpoint(
    address addr_,
    LockedBalance memory oldLocked_,
    LockedBalance memory newLocked_
) internal
```

Called for each user action to update point history and reward information.

- If `addr` is not `ZERO_ADDRESS`:
  - Calculates the old and new slope and bias for `addr`.
  - Calculates the change in slope (`slopeChanges`).
  - Updates the user's point history.
- Creates up to 255 weeks of history from the last point in `pointHistory`. If there is no history for a period longer than 255 weeks (i.e., no user actions), accurate calculations cannot be performed.

**Parameters**

| Name         | Type            | Description          | Constraints |
| ------------ | --------------- | -------------------- | ----------- |
| `addr_`      | `address`       | Address of the user  | -           |
| `oldLocked_` | `LockedBalance` | Old lock information | -           |
| `newLocked_` | `LockedBalance` | New lock information | -           |

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

Locks an arbitrary amount of YMWK on behalf of any `addr`.

**Parameters**

| Name             | Type            | Description               | Constraints |
| ---------------- | --------------- | ------------------------- | ----------- |
| `addr_`          | `address`       | Address of the user       | -           |
| `value_`         | `uint256`       | Amount to lock            | -           |
| `unlockTime_`    | `uint256`       | Timestamp when lock ends  | -           |
| `lockedBalance_` | `LockedBalance` | Previous lock information | -           |
| `type_`          | `uint128`       | Event identifier          | -           |

---

#### `checkpoint`

```solidity
function checkpoint() external
```

- Calls `_checkpoint` to update the global state of veYMWK.

---

#### `depositFor`

```solidity
function depositFor(address addr_, uint256 value_) external nonReentrant
```

- Calls `_depositFor` to lock an arbitrary amount of YMWK on behalf of any `addr`.
- Reverts if there is no existing lock.

**Conditions**
`msg.sender` is allowed to deposit on behalf of `addr_`

**Parameters**

| Name     | Type      | Description         | Constraints |
| -------- | --------- | ------------------- | ----------- |
| `addr_`  | `address` | Address of the user | -           |
| `value_` | `uint256` | Amount to lock      | -           |

---

#### `toggleDepositForApproval`

```solidity
function toggleDepositForApproval(address depositor_) external
```

- Toggles the permission for a specific depositor to call depositFor on behalf of the message sender

**引数**

| 引数名  | 型           | 概要                                                           | 制約 |
| ------- | ------------ | -------------------------------------------------------------- | ---- |
| `addr_` | `depositor_` | The address of the depositor whose permission is being toggled | -    |

---

#### `toggleDepositForAllApproval`

```solidity
function toggleDepositForAllApproval() external
```

- Toggles the permission for all addresses to call depositFor on behalf of the message sender

---

#### `createLock`

```solidity
function createLock(
    uint256 value_,
    uint256 unlockTime_
) external nonReentrant
```

- Creates a new lock.
- Reverts if there is an existing lock.

**Parameters**

| Name          | Type      | Description              | Constraints |
| ------------- | --------- | ------------------------ | ----------- |
| `value_`      | `uint256` | Amount to lock           | -           |
| `unlockTime_` | `uint256` | Timestamp when lock ends | -           |

---

#### `increaseAmount`

```solidity
function increaseAmount(uint256 value_) external nonReentrant
```

Increases the lock amount.

**Parameters**

| Name     | Type      | Description        | Constraints |
| -------- | --------- | ------------------ | ----------- |
| `value_` | `uint256` | Amount to increase | -           |

---

#### `increaseUnlockTime`

```solidity
function increaseUnlockTime(uint256 unlockTime_) external nonReentrant
```

Extends the lock period.

**Parameters**

| Name          | Type      | Description            | Constraints |
| ------------- | --------- | ---------------------- | ----------- |
| `unlockTime_` | `uint256` | New lock end timestamp | -           |

---

#### `withdraw`

```solidity
function withdraw() external nonReentrant
```

Withdraws YMWK whose lock period has ended.

---

#### `findBlockEpoch`

```solidity
function findBlockEpoch(
    uint256 block_,
    uint256 maxEpoch_
) internal view returns (uint256)
```

Searches for and returns the epoch closest to the specified block number.

**Parameters**

| Name        | Type      | Description                    | Constraints |
| ----------- | --------- | ------------------------------ | ----------- |
| `block_`    | `uint256` | Block number                   | -           |
| `maxEpoch_` | `uint256` | Maximum epoch number to search | -           |

**Returns**

- `uint256`
  - Epoch closest to the specified block number

---

#### `balanceOf`

```solidity
function balanceOf(
    address addr_,
    uint256 t_
) external view returns (uint256)
```

- Returns the veYMWK balance of the specified address at the specified timestamp.
- Fails if `t_` is before the last recorded point in the user's point history.

**Parameters**

| Name    | Type      | Description         | Constraints                                |
| ------- | --------- | ------------------- | ------------------------------------------ |
| `addr_` | `address` | Address of the user | -                                          |
| `t_`    | `uint256` | Timestamp           | Must be after the last recorded user point |

**Returns**

- `uint256`
  - veYMWK balance of the specified address at the specified timestamp

---

#### `balanceOf`

```solidity
function balanceOf(
    address addr_
) external view returns (uint256)
```

Returns the current veYMWK balance of the specified address.

**Parameters**

| Name    | Type      | Description         | Constraints |
| ------- | --------- | ------------------- | ----------- |
| `addr_` | `address` | Address of the user | -           |

**Returns**

- `uint256`
  - Current veYMWK balance of the specified address

---

#### `balanceOfAt`

```solidity
function balanceOfAt(
    address addr_,
    uint256 block_
) external view returns (uint256)
```

Returns the veYMWK balance of the specified address at the specified block number.

**Parameters**

| Name     | Type      | Description         | Constraints                                        |
| -------- | --------- | ------------------- | -------------------------------------------------- |
| `addr_`  | `address` | Address of the user | -                                                  |
| `block_` | `uint256` | Block number        | Must be less than or equal to current block number |

**Returns**

- `uint256`
  - veYMWK balance of the specified address at the specified block number

---

#### `supplyAt`

```solidity
function supplyAt(
    Point memory point_,
    uint256 t_
) internal view returns (uint256)
```

- Returns the total veYMWK supply at the specified timestamp starting from the specified point.
- If no points have been recorded for more than 255 weeks, accurate calculations cannot be performed.

**Parameters**

| Name     | Type      | Description    | Constraints |
| -------- | --------- | -------------- | ----------- |
| `point_` | `Point`   | Starting point | -           |
| `t_`     | `uint256` | Timestamp      | -           |

**Returns**

- `uint256`
  - Total veYMWK supply at the specified timestamp starting from the specified point

---

#### `totalSupply`

```solidity
function totalSupply(uint256 t_) external view returns (uint256)
```

Returns the total veYMWK supply at the specified timestamp starting from the last recorded point.

**Parameters**

| Name | Type      | Description | Constraints |
| ---- | --------- | ----------- | ----------- |
| `t_` | `uint256` | Timestamp   | -           |

**Returns**

- `uint256`
  - Total veYMWK supply at the specified timestamp starting from the last recorded point

---

#### `totalSupply`

```solidity
function totalSupply() external view returns (uint256)
```

Returns the current total veYMWK supply starting from the last recorded point.

**Returns**

- `uint256`
  - Current total veYMWK supply starting from the last recorded point

---

#### `totalSupplyAt`

```solidity
function totalSupplyAt(uint256 block_) external view returns (uint256)
```

Returns the total veYMWK supply at the specified block number.

**Parameters**

| Name     | Type      | Description  | Constraints |
| -------- | --------- | ------------ | ----------- |
| `block_` | `uint256` | Block number | -           |

**Returns**

- `uint256`
  - Total veYMWK supply at the specified block number

---
