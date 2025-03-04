# Yamawake DAO Token (YMWK)

## Overview

An ERC20 token. It has an initial issuance of 450,000,000, with 55,000,000 released in the first year, and a 10% decrease annually over 235 years. The total issuance will eventually converge to 1,000,000,000.

## Actor

- Minter: Can mint a specified number up to a predetermined limit.
- Admin: Can designate the Minter.

## Features

### Constants

- INITIAL_SUPPLY: Initial issuance.
- INITIAL_RATE: Initial setting for the possible issuance increase rate.
- RATE_REDUCTION_TIME: Duration in which the issuance rate is updated per unit time.
- RATE_REDUCTION_COEFFICIENT: Reduction rate.
- RATE_DENOMINATOR: Constant used for calculating the possible issuance increase rate.

### Properties

- Can hold one Minter address.
- Can hold one Admin address.
- Can hold a number of epochs.
- Can hold the start time for the number of epochs.
- Rate of possible issuance increase per unit time.

### Initialization

- Can set the Admin.
- Can set the initial issuance.
- Can mint a specified number.
- Can set the number of epochs.
- Can set the start time for the number of epochs.
- Can set the rate of possible issuance increase per unit time.

### updateMiningParameters

- Update the rate of possible issuance increase per unit time.

### startEpochTimeWrite

- Return the start time of the current epoch.
- Update the rate of possible issuance increase per unit time.

### futureEpochTimeWrite

- Return the start time of the next epoch.
- Update the rate of possible issuance increase per unit time.

### availableSupply

- Can retrieve the current possible issuance.

### mintableInTimeframe

- Return the amount that can be issued in a specified period.

### setMinter

- Admin can set the Minter only once.

### setAdmin

- Admin can set the Admin.

### mint

- Minter can mint a specified number and add to the current issuance.

### burn

- Users can burn YMWK from their balance
