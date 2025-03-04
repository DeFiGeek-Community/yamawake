## Actors

- **User**
  - Any user or contract
- **YMWK Holder**
  - Holder of YMWK tokens
  - Assumed to be an EOA (Externally Owned Account) or contract
- **[VotingEscrow](./index.md)**
  - Issues non-transferable veYMWK by locking YMWK tokens
  - Manages veYMWK balances
- **[RewardGauge](../RewardGaugeV1/index.md)**
  - Calculates and maintains YMWK reward information for veYMWK holders
- **[Minter](../MinterV1/index.md)**
  - The Minter set for the YMWK token
  - Calls the mint function of YMWK to mint a specified amount of YMWK
- **[YMWK](../YamawakeToken/index.md)**
  - YMWK Token

## Use Cases

- **User**
  - Increase the amount of YMWK locked
- **YMWK Holder**
  - Lock YMWK
  - Increase the amount of YMWK locked
  - Extend the YMWK lock period
  - Withdraw YMWK
- **VotingEscrow**
  - Update the user's point history
  - Maintain the user's point history
  - Update the global point history
  - Maintain the global point history
- **Gauge**
  - Retrieve the user's point history
  - Retrieve the global point history
- **GaugeController**
  - Retrieve the weight of the Gauge

## Use Case Diagram

```mermaid
graph LR
    classDef transparent fill:none,stroke:none;
    holder{{"YMWK Holder"}}
    user{{"User"}}

    create_lock["Lock YMWK"]
    increase_amount["Increase YMWK Lock Amount"]
    increase_unlock_time["Extend YMWK Lock Period"]
    withdraw["Withdraw YMWK"]
    uck["Update User's Point History"]
    ck["Update Global Point History"]
    integral["Retrieve and Store Total veYMWK Balance for up to 20 Weeks"]
    integral_of["Retrieve User ve History for up to 50 Epochs and Store Epoch Count"]
    ve_total_supply["Retrieve Global Point History"]
    ve_user_balance["Retrieve User's Point History"]

    mint["Mint"]
    rate["Retrieve Inflation Rate"]
    future_epoch_time_write["Retrieve Timestamp of Next Inflation Rate Change"]
    update_rate["Update Inflation Rate"]
    update_minted["Update User's Minted YMWK Token Amount"]
    minted["Retrieve User's Minted YMWK Token Amount"]
    claim_ymwk["Claim YMWK Rewards"]

    integrate_fraction["Retrieve Current YMWK Reward Amount integrateFraction"]
    claimable_tokens["Retrieve YMWK Reward Amount After Updating States claimableTokens"]

    gauge_relative_weight["Retrieve Gauge Weight"]

    create_lock -.->|include| uck
    increase_amount -.->|include| uck
    increase_unlock_time -.->|include| uck
    withdraw -.->|include| uck
    uck -.->|include| ck
    user --- ck
    user --- increase_amount
    holder --- create_lock
    holder --- increase_amount
    holder --- increase_unlock_time
    holder --- withdraw

    integral_of -.->|include| integral
    claimable_tokens -.->|include| integrate_fraction
    claimable_tokens -.->|include| integral_of

    user ---> holder
    user --- claim_ymwk
    user ---|Execute as View Function| claimable_tokens

    claim_ymwk -.->|include| integrate_fraction
    claim_ymwk -.->|include| integral_of
    claim_ymwk -.->|include| mint
    claim_ymwk -.->|include| minted
    claim_ymwk -.->|include| update_minted

    future_epoch_time_write -.->|include| update_rate

    integral_of -.-|include| ve_user_balance
    integral -.-|include| ve_total_supply
    integral -.-|include| rate
    integral -.-|include| future_epoch_time_write

    integral -.-|include| gauge_relative_weight


    subgraph Gauge
      integrate_fraction
      claimable_tokens
      integral_of
      integral
    end

    subgraph GaugeController
      gauge_relative_weight
    end

    subgraph VotingEscrow
      ve_total_supply
      ve_user_balance
      direction LR
      create_lock
      increase_amount
      increase_unlock_time
      withdraw
      uck
      ck
    end

    subgraph YMWK
      direction LR
      mint
      rate
      future_epoch_time_write
      update_rate
    end

    subgraph Minter
      direction LR
      claim_ymwk
      minted
      update_minted
    end
```
