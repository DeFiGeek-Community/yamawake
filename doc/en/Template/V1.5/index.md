# TemplateV1.5

## Overview

IBAO (Initial Bulk Auction Offering) Template.

#### Differences from [V1](../V1/index.md)

- The fee recipient upon revenue collection is the FeeDistributor.
- Creates a token checkpoint for the FeeDistributor when collecting revenue.

## Bulk Auction

An auction where a fixed amount of tokens provided by the organizer is distributed equally among all bidders.

Participants (bidders) receive tokens proportional to their individual bid amounts relative to the total bid amount.

Since everyone gets tokens at the same price, there is no advantage or disadvantage based on the timing of the bid.

The amount allocated to each participant is unknown until the final total bid amount is determined.

The higher the bid amount, the higher the token price (the smaller the allocation), and the lower the bid amount, the lower the token price (the larger the allocation).

## Specifications

### Fixed Parameters

- Minimum Bid Amount
  - 0.001 ETH
- Total Bid Limit
  - 1e27
- Sale Token Limit
  - 1e50
- Fee
  - 1% of the final bid amount
- Distributor
  - Address of the Distributor

### Required Parameters

| Parameter Name  | Type    | Description                            | Conditions                          |
| --------------- | ------- | -------------------------------------- | ----------------------------------- |
| owner           | address | Auction owner                          | Must not be the zero address        |
| tokenAddr       | address | Address of the token to be sold        | Must not be the zero address        |
| allocatedAmount | uint256 | Amount of tokens to be sold            | Between 1 and 1e50 inclusive        |
| startingAt      | uint256 | Auction start time (timestamp)         | Must be after current block time    |
| eventDuration   | uint256 | Duration of the auction (in seconds)   | Between 1 day and 30 days inclusive |
| minRaisedAmount | uint256 | Minimum bid amount for auction success | Between 0 and 1e27 inclusive        |

### Flow

#### Before the Auction

The auction organizer launches the auction.

#### During the Auction

Auction participants place their bids.

#### After the Auction

- **If the Auction is Successful**
  - The auction organizer collects the bid tokens.
    - Adds a reward score to the organizer in the Distributor.
    - If within 3 days after the auction ends:
      - Calculates the allocation amount for the minimum bid amount (0.001 ETH). If it is zero, waits.
  - Auction participants claim the sale tokens.
    - If the allocation of auction tokens is equal to or greater than 1 minimum unit:
      - Adds a reward score to the participant in the Distributor.
      - Creates a token checkpoint for the FeeDistributor.
      - Claims the allocated amount of tokens.
    - If the allocation of auction tokens is zero:
      - If the auction organizer has not yet collected the bid tokens, participants can retrieve their bid amounts.
- **If the Auction Fails**
  - The auction organizer retrieves the sale tokens.
  - Auction participants retrieve their bid tokens.
