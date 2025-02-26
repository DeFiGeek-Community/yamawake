# FeeDistributorV1

## Overview

Distributes auction fees as rewards to veYMWK holders.

## Parent classes

UUPSBase, ReentrancyGuardUpgradeable

## Features

### Constants

`WEEK: uint256 public constant`

- Number of seconds in one week (7 × 86400)

### Properties

#### `factory: address public`

- Holds the address of the Factory.

#### `timeCursor: uint256 public`

- Holds the timestamp of the last (most recent) history where veYMWK synchronization is complete.

#### `lastCheckpointTotalSupplyTime: uint256 public`

- Holds the timestamp when the total supply of veYMWK was last synchronized.

#### `timeCursorOf: mapping(address => mapping(address => uint256)) public`

- For each user and token, holds the timestamp at the start of the week (multiple of WEEK) following the week where reward claims have been completed.

#### `userEpochOf: mapping(address => mapping(address => uint256)) public`

- For each user and token, holds the number of epochs that have been synchronized with the `userPointHistory` of VotingEscrow.

#### `lastTokenTime: mapping(address => uint256) public`

- Holds the timestamp at the time of the last checkpoint for each token.

#### `startTime: uint256 public`

- Holds the timestamp when reward distribution starts.

#### `tokensPerWeek: mapping(address => mapping(uint256 => uint256)) public`

- Holds the reward amounts per week and per token type.

#### `votingEscrow: address public`

- Holds the address of the VotingEscrow.

#### `tokens: address[] public`

- Holds the addresses of reward tokens.
- `0x0` represents ETH.

#### `tokenFlags: mapping(address => uint256) public`

- Holds a flag indicating whether a token address is registered as a reward token.
  - `0` → Unregistered
  - `1` → Registered
- Address `0x0` represents ETH.

#### `tokenLastBalance: mapping(address => uint256) public`

- Holds the balance at the time of the checkpoint for each token.

#### `veSupply: mapping(uint256 => uint256) public`

- Holds the total veYMWK balance per week.

#### `isKilled: bool public`

- Holds the state indicating whether the contract is killed or not.

### Functions

#### initializer

```solidity
function initialize(
    address votingEscrow_,
    address factory_,
    uint256 startTime_
) public initializer
```

Sets `startTime` to the timestamp at the beginning of the week of the given `startTime_` and performs the following initial settings:

- Initializes `UUPSBase`.
- Initializes `ReentrancyGuard`.
- Sets `lastTokenTime` of ETH to the timestamp at the beginning of the week of `startTime_`.
- Sets `timeCursor` to the timestamp at the beginning of the week of `startTime_`.
- Adds the ETH address (`0x0`) to `tokens`.
- Sets `tokenFlags` of the ETH address (`0x0`) to `true`.
- Sets `votingEscrow`.
- Sets `factory`.
- Sets `admin` to `msg.sender`.

**Parameters**

| Name            | Type      | Description                               | Constraints |
| --------------- | --------- | ----------------------------------------- | ----------- |
| `votingEscrow_` | `address` | Address of the VotingEscrow               | -           |
| `factory_`      | `address` | Address of the Factory                    | -           |
| `startTime_`    | `uint256` | Timestamp when reward distribution starts | -           |

---

#### \_checkpointToken

```solidity
function _checkpointToken(
    address address_
) internal
```

Distributes the difference between the specified token balance at the time of execution and the balance at the previous checkpoint, divided by the elapsed time since the previous checkpoint, for each week. If weeks have been crossed since the last checkpoint, distribution starts from the next week after the last checkpoint. If more than 20 weeks have passed since the last checkpoint, distribution is made for the past 20 weeks including the week of this checkpoint.

**Parameters**

| Name       | Type      | Description                 | Constraints |
| ---------- | --------- | --------------------------- | ----------- |
| `address_` | `address` | Address of the reward token | -           |

---

#### checkpointToken

```solidity
function checkpointToken(
    address address_
) external onlyAdminOrAuction
```

Executes `_checkpointToken`.

**Conditions**

- `address_` is registered in `tokenFlags`.
- Only executable by admin or auction.

**Parameters**

| Name       | Type      | Description                 | Constraints |
| ---------- | --------- | --------------------------- | ----------- |
| `address_` | `address` | Address of the reward token | -           |

---

#### \_findTimestampEpoch

```solidity
function _findTimestampEpoch(
    address ve_,
    uint256 timestamp_
) internal view returns (uint256)
```

Searches the `pointHistory` of VotingEscrow based on the timestamp and returns the epoch number that was created closest before the timestamp.

**Parameters**

| Name         | Type      | Description                 | Constraints |
| ------------ | --------- | --------------------------- | ----------- |
| `ve_`        | `address` | Address of the VotingEscrow | -           |
| `timestamp_` | `uint256` | Target timestamp to search  | -           |

**Returns**

- `uint256`
  - Epoch number immediately before the specified timestamp.

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

Searches the user's `pointHistory` in VotingEscrow based on the timestamp and returns the user epoch number that was created closest before the timestamp.

**Parameters**

| Name            | Type      | Description                 | Constraints |
| --------------- | --------- | --------------------------- | ----------- |
| `ve_`           | `address` | Address of the VotingEscrow | -           |
| `user_`         | `address` | Target user to search       | -           |
| `timestamp_`    | `uint256` | Target timestamp to search  | -           |
| `maxUserEpoch_` | `uint256` | Maximum user epoch number   | -           |

**Returns**

- `uint256`
  - User epoch number immediately before the specified timestamp.

---

#### veForAt

```solidity
function veForAt(
    address user_,
    uint256 timestamp_
) external view returns (uint256)
```

Returns the veYMWK balance of the user at the specified timestamp.

**Parameters**

| Name         | Type      | Description               | Constraints |
| ------------ | --------- | ------------------------- | ----------- |
| `user_`      | `address` | Target user to query      | -           |
| `timestamp_` | `uint256` | Target timestamp to query | -           |

**Returns**

- `uint256`
  - veYMWK balance of the user at the specified timestamp.

---

#### \_checkpointTotalSupply

```solidity
function _checkpointTotalSupply() internal
```

After executing the `checkpoint` of VotingEscrow, records the veYMWK balance history at the start of each week for up to the past 20 weeks.

---

#### checkpointTotalSupply

```solidity
function checkpointTotalSupply() external
```

Executes `_checkpointTotalSupply`.

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

Calculates the specified user's reward amount of the specified token up to the previous week at the time of execution. If the number of user epochs since the previous execution plus the number of weeks elapsed is 50 or more, multiple calls are required to calculate up to the previous week.

**Parameters**

| Name             | Type      | Description                                   | Constraints              |
| ---------------- | --------- | --------------------------------------------- | ------------------------ |
| `addr_`          | `address` | Address of the target user                    | Must not be zero address |
| `token_`         | `address` | Address of the reward token                   | -                        |
| `ve_`            | `address` | Address of the VotingEscrow                   | Must not be zero address |
| `lastTokenTime_` | `uint256` | Timestamp of the last checkpoint of the token | -                        |

**Returns**

- `_amount`
  - Reward amount of the specified token.

---

#### claim

```solidity
function claim(
    address token_
) external nonReentrant returns (uint256)
```

Claims rewards for `msg.sender`. By executing as a `view` function, you can obtain the claimable reward amount.

**Conditions**

- Not in killed state.
- Target token is registered in `tokens`.

**Parameters**

| Name     | Type      | Description                 | Constraints |
| -------- | --------- | --------------------------- | ----------- |
| `token_` | `address` | Address of the reward token | -           |

**Returns**

- `_amount`
  - Reward amount of the specified token.

---

#### claim

```solidity
function claim(
    address addr_,
    address token_
) external nonReentrant returns (uint256)
```

Claims rewards for the specified address. By executing as a `view` function, you can obtain the claimable reward amount.

**Conditions**

- Not in killed state.
- Target token is registered in `tokens`.

**Parameters**

| Name     | Type      | Description                 | Constraints |
| -------- | --------- | --------------------------- | ----------- |
| `addr_`  | `address` | Address of the target user  | -           |
| `token_` | `address` | Address of the reward token | -           |

**Returns**

- `_amount`
  - Reward amount of the specified token.

---

#### claimMany

```solidity
function claimMany(
    address[] receivers_,
    address token_
) external nonReentrant returns (bool)
```

Claims rewards for multiple addresses at once.

**Conditions**

- Not in killed state.
- Target token is registered in `tokens`.

**Parameters**

| Name         | Type        | Description                    | Constraints |
| ------------ | ----------- | ------------------------------ | ----------- |
| `receivers_` | `address[]` | Array of target user addresses | -           |
| `token_`     | `address`   | Address of the reward token    | -           |

---

#### claimMultipleTokens

```solidity
function claimMultipleTokens(
    address addr_,
    address[20] tokens_
) external nonReentrant returns (bool)
```

Claims multiple token rewards at once.

**Conditions**

- Not in killed state.
- Target tokens are registered in `tokens`.

**Parameters**

| Name      | Type          | Description                     | Constraints                                |
| --------- | ------------- | ------------------------------- | ------------------------------------------ |
| `addr_`   | `address`     | Address of the target user      | -                                          |
| `tokens_` | `address[20]` | Array of reward token addresses | Up to 20 tokens (subject to consideration) |

---

#### killMe

```solidity
function killMe() external onlyAdmin
```

Changes the killed state to `true` and transfers the Ether balance to the admin.

**Conditions**

- Admin only.

---

#### recoverBalance

```solidity
function recoverBalance(
    address coin_
) external onlyAdmin returns (bool)
```

Transfers the entire balance of the specified token to the admin.

**Conditions**

- Admin only.
- Target token is registered in `tokens`.

**Parameters**

| Name    | Type      | Description          | Constraints |
| ------- | --------- | -------------------- | ----------- |
| `coin_` | `address` | Address of the token | -           |

**Returns**

- `bool`
  - Indicates the success of the process.

---

#### addRewardToken

```solidity
function addRewardToken(
    address coin_
) external onlyAdminOrAuction returns (bool)
```

Adds the specified token as a reward token.

**Conditions**

- Only executable by the auction contract or admin.

**Parameters**

| Name    | Type      | Description          | Constraints |
| ------- | --------- | -------------------- | ----------- |
| `coin_` | `address` | Address of the token | -           |

**Returns**

- `bool`
  - Indicates the success of the process.

---

#### getTokens

```solidity
function getTokens() external view returns (address[])
```

Retrieves the array of registered token addresses.

**Returns**

- `address[]`
  - Array of token addresses.

---
