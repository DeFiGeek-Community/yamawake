## Actors

- **User**
  - Any user or contract
- **YMWK Holder**
  - Holder of YMWK tokens
  - Expected to be an EOA (Externally Owned Account) or a contract
    - Reference
      - [VotingEscrow](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/VotingEscrow.vy#L109)
- **[VotingEscrow](./index.md)**
  - Issues non-transferable veYMWK by locking YMWK tokens
  - Manages veYMWK balances
- **[Gauge](../GaugeV1/index.md)**
  - Calculates and maintains YMWK reward information for veYMWK holders
- **[Minter](../MinterV1/index.md)**
  - The Minter set for the YMWK token
  - Calls the mint function of YMWK to mint a specified amount of YMWK
- **[YMWK](../YamawakeToken/index.md)**
  - YMWK Token
- **VotingEscrow Owner**
  - Owner of the VotingEscrow contract

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
- **VotingEscrow Owner**
  - Deploy the VotingEscrow
  - Change the administrator

## Use Case Diagram

```mermaid
graph LR
    classDef transparent fill:none,stroke:none;
    owner{{"VotingEscrow Owner"}}
    holder{{"YMWK Holder"}}
    user{{"User"}}

    create_lock["Lock YMWK"]
    increase_amount["Increase YMWK Lock Amount"]
    increase_unlock_time["Extend YMWK Lock Period"]
    withdraw["Withdraw YMWK"]
    uck["Update User's Point History"]
    ck["Update Global Point History"]
    integral["Retrieve and Store up to 20 Weeks of Global ve History\nintegrate_inv_supply"]
    integral_of["Retrieve and Store up to 50 User Epochs of ve History\nintegrate_inv_supply_of\nintegrate_checkpoint_of\nintegrate_fraction"]
    ve_total_supply["Retrieve Global Point History"]
    ve_user_balance["Retrieve User's Point History"]

    mint["Mint"]
    rate["Retrieve Inflation Rate"]
    future_epoch_time_write["Retrieve Next Inflation Rate Change Timestamp"]
    update_rate["Update Inflation Rate"]
    update_minted["Update User's Minted YMWK Amount"]
    minted["Retrieve User's Minted YMWK Amount"]
    claim_ymwk["Claim YMWK Rewards"]

    deploy["Deploy VotingEscrow"]


    claimable_tokens["Retrieve YMWK Reward Amount\nintegrate_fraction"]

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
    claimable_tokens -.->|include| integral_of

    user ---> holder
    user --- claim_ymwk
    user ---|Execute as View Function| claimable_tokens

    claim_ymwk -.->|include| claimable_tokens
    claim_ymwk -.->|include| mint
    claim_ymwk -.->|include| minted
    claim_ymwk -.->|include| update_minted

    future_epoch_time_write -.->|include| update_rate

    integral_of -.-|include| ve_user_balance
    integral -.-|include| ve_total_supply
    integral -.-|include| rate
    integral -.-|include| future_epoch_time_write

    integral -.-|include| gauge_relative_weight



    owner --- deploy

    subgraph Admin[ ]
      direction LR
      deploy
    end

    class Admin transparent

    subgraph Gauge
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
