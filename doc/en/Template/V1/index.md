# TemplateV1

## Overview

IBAO (Initial Bulk Auction Offering) Template

## Bulk Auction

An auction where a fixed amount of tokens provided by the organizer is distributed among all bidders.

Participants (bidders) receive a proportion of tokens equal to their individual bid ratio to the total bid amount.

All participants obtain tokens at the same price, ensuring there's no advantage or disadvantage based on bid timing.

The allocated amount is unknown until the final total bid amount is determined.

Higher bid amounts lead to higher token prices (lower allocation), and lower bids lead to lower prices (higher allocation).

## Specifications

### Fixed Parameters

- Minimum bid amount:
  - 0.001ETH
- Total bid cap:
  - 1e27
- Sale token cap:
  - 1e50
- Fee:
  - 1% of the final bid amount
- Distributor:
  - Address of the Distributor

### Required Parameters

| Parameter Name  | Type    | Description                         | Conditions                  |
| --------------- | ------- | ----------------------------------- | --------------------------- |
| owner           | address | Auction owner                       | Not a 0 address             |
| tokenAddr       | address | Address of the token being sold     | Not a 0 address             |
| allocatedAmount | uint256 | Amount of tokens to be sold         | 1 or more, up to 1e50       |
| startingAt      | uint256 | Auction start time (timestamp)      | After current block time    |
| eventDuration   | uint256 | Auction duration (seconds)          | 1 day or more, up to 30 days|
| minRaisedAmount | uint256 | Minimum total raised amount (for auction success) | 0 or more, up to 1e27    |

### Flow

#### Before the Auction

The auction organizer sets up the auction.

#### During the Auction

Auction participants place their bids.

#### After the Auction

- On successful auction:
  - The auction organizer collects the bid tokens.
    - Add reward score for the auction organizer in the Distributor.
    - If within 3 days of the auction's end:
      - Calculate the allocation amount for the minimum bid (0.001ETH). If it's 0, wait.
  - Auction participants claim the sold tokens.
    - If the auction token allocation is 1 minimum unit or more:
      - Add a reward score for the auction participant in the Distributor.
      - Claim the allocated token amount.
    - If the auction token allocation is 0:
      - If the organizer hasn't collected the bid tokens yet, collect the bid amount.
- On failed auction:
  - The auction organizer collects the sale tokens.
  - Auction participants collect their bid tokens.
