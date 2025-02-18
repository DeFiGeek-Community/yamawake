# TokenMinter

## Overview

A fork of Curve's [TokenMinter](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/Minter.vy).

Receives mint requests from users, retrieves the amount that can be minted from the Gauge, and mints YMWK tokens.

### Main Changes from the Curve Version

- Changed to be upgradable by inheriting `UUPSUpgradeable`

## Parent classes

UUPSBase, ReentrancyGuardUpgradeable

## Features

### Properties

#### `token: address public`

- Holds the token address.

#### `controller: address public`

- Holds the GaugeController address.

#### `minted: mapping(address => mapping(address => uint256)) public`

- For each user and each Gauge, holds the amount of YMWK that has been minted.

#### `allowedToMintFor: mapping(address => mapping(address => bool)) public`

- For each minter address, holds a flag indicating whether minting on behalf of a specified address is allowed.

## Functions

#### initializer

```solidity
function initialize(
    address token_,
    address controller_
) public initializer
```

- Initializes `UUPSBase`.
- Initializes `ReentrancyGuard`.
- Sets `token`.
- Sets `controller`.

**Parameters**

| Parameter Name | Type      | Description               | Constraints |
| -------------- | --------- | ------------------------- | ----------- |
| `token_`       | `address` | Address of the token      | -           |
| `controller_`  | `address` | Address of the controller | -           |

---

#### \_mintFor

```solidity
function _mintFor(
    address gaugeAddr_,
    address for_
) internal
```

Mints tokens from the specified Gauge to the specified address.

**Conditions**

- `gaugeAddr_` is registered in the `controller`.

**Parameters**

| Parameter Name | Type      | Description                 | Constraints |
| -------------- | --------- | --------------------------- | ----------- |
| `gaugeAddr_`   | `address` | Address of the target Gauge | -           |
| `for_`         | `address` | Address to mint tokens for  | -           |

---

#### mint

```solidity
function mint(
    address gaugeAddr_
) external nonReentrant
```

Mints the amount of tokens that can be minted from the specified Gauge to `msg.sender`.

**Parameters**

| Parameter Name | Type      | Description                 | Constraints |
| -------------- | --------- | --------------------------- | ----------- |
| `gaugeAddr_`   | `address` | Address of the target Gauge | -           |

---

#### mintMany

```solidity
function mintMany(
    address[8] gaugeAddrs_
) external nonReentrant
```

Mints the amount of tokens that can be minted from the specified Gauges to `msg.sender`.

**Parameters**

| Parameter Name | Type         | Description                     | Constraints |
| -------------- | ------------ | ------------------------------- | ----------- |
| `gaugeAddrs_`  | `address[8]` | Array of target Gauge addresses | -           |

---

#### mintFor

```solidity
function mintFor(
    address gaugeAddr_,
    address for_
) external nonReentrant
```

Mints tokens from the specified Gauge to the specified address.

**Conditions**

- `msg.sender` is allowed to mint for `for_` (`allowedToMintFor` is `true`).

**Parameters**

| Parameter Name | Type      | Description                 | Constraints |
| -------------- | --------- | --------------------------- | ----------- |
| `gaugeAddr_`   | `address` | Address of the target Gauge | -           |
| `for_`         | `address` | Address to mint tokens for  | -           |

---

#### toggleApproveMint

```solidity
function toggleApproveMint(
    address mintingUser_
) external
```

Allows the specified address to mint tokens on behalf of `msg.sender`.

**Parameters**

| Parameter Name | Type      | Description                             | Constraints |
| -------------- | --------- | --------------------------------------- | ----------- |
| `mintingUser_` | `address` | Address to be allowed to mint on behalf | -           |

---
