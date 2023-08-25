# Actors

- Auction
  - Holds auction information
  - Calculates allocation amount
  - Sends fees to the fee pool
  - Holds transfer functions
- Auction Organizer
  - Collects sales tokens
  - Collects selling tokens
- Auction Participants
  - Place bids
  - Claim allocated tokens
  - Claim bid tokens
- Factory
  - Calls transfer functions

## Use Case Diagram

```mermaid
graph LR
    sow{{Auction Organizer}}
    spa{{Auction Participant}}
    f{{Factory}}

    S1[Hold auction information]
    S2[Calculate allocation amount]
    S3[Send fees to fee pool]

    sow-->SOW1[Collect sales tokens]
    sow-->SOW2[Collect selling tokens]

    spa-->SPA1[Bid]
    spa-->SPA2[Claim allocated tokens]
    spa-->SPA3[Claim bid tokens]

    f-->F1[Call transfer functions]

    subgraph Auction
        S1
        S2
        S3
        SOW1
        SOW2
        SPA1
        SPA2
        SPA3
        F1
    end
```
