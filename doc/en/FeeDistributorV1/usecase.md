## Actors

- **User** (Any user or contract)
  - Retrieve reward amounts
  - Claim rewards
  - Claim rewards for multiple addresses (up to 20 addresses) at once
  - Claim rewards for multiple tokens (up to 20 tokens) at once
  - Get the list of reward tokens
- **Auction Owner**
  - Withdraw tokens
  - Withdraw ETH
- **[Auction](../Template/index.md)**
  - Add token addresses
  - Transfer tokens to the FeeDistributor
- **FeeDistributor Owner**
  - Deploy the FeeDistributor
  - Change the admin
  - Transfer tokens to the emergency token recipient
  - Set the FeeDistributor to the killed state
- **FeeDistributor**
  - Distribute deposited fees weekly and maintain them
  - Distribute the weekly allocated rewards to veYMWK holders according to their veYMWK balances each week
  - Retrieve up to 50 epochs of user ve history and maintain the epoch count
  - Retrieve up to 20 weeks of total veYMWK supply
  - Maintain the total veYMWK supply at the beginning of each week
- **[VotingEscrow](./index.md)**
  - Manage veYMWK balances

## Use Case Diagram

```mermaid
graph LR
    auction_owner{{"Auction Owner"}}
    owner{{"FeeDistributor Owner"}}
    user{{"User"}}
    deploy["Deploy FeeDistributor"]
    withdraw_ether["Withdraw ETH"]
    withdraw_erc20["Withdraw Tokens"]
    add_reward["Add Token Address"]
    deposit_reward_ether["Deposit ETH"]
    deposit_reward_token["Deposit Tokens"]
    claim["Claim Rewards"]
    claim_many["Claim Rewards for Multiple Addresses (up to 20 addresses)"]
    claim_multiple_tokens["Claim Rewards for Multiple Tokens (up to 20 tokens)"]
    claimable_token["Retrieve Reward Amount"]
    get_tokens["Get List of Reward Tokens"]
    user_point_history["Retrieve User Point History"]
    point_history["Retrieve Overall Point History"]
    sync_ve["Retrieve and Save Total veYMWK Supply for up to 20 Weeks"]
    sync_user_ve["Retrieve up to 50 Epochs of User ve History and Maintain Epoch Count"]
    checkpoint_token["Distribute Deposited Fees Weekly"]
    set_admin["Change Admin"]
    kill["Set FeeDistributor to Killed State"]
    evacuate["Transfer Tokens to Emergency Recipient"]

    owner --- deploy
    owner --- kill
    owner --- evacuate
    owner --- set_admin

    auction_owner --- withdraw_ether
    auction_owner --- withdraw_erc20

    withdraw_ether -.->|include| deposit_reward_ether
    withdraw_erc20 -.->|include| deposit_reward_token
    withdraw_erc20 -.->|include| add_reward

    deposit_reward_ether -.->|include| sync_ve
    deposit_reward_token -.->|include| sync_ve
    deposit_reward_ether -.->|include| checkpoint_token
    deposit_reward_token -.->|include| checkpoint_token

    user --- claim
    user --- claim_many
    user --- claim_multiple_tokens
    user ---|Execute as View Function| claimable_token
    user --- get_tokens

    claim -.->|include| claimable_token
    claim_many -.->|include| claimable_token
    claim_multiple_tokens -.->|include| claimable_token
    claimable_token -.->|include| sync_ve

    claimable_token -.->|include| sync_user_ve

    sync_user_ve -.->|include| user_point_history
    sync_ve -.->|include| point_history

    classDef green fill:#555,stroke-width:2px,stroke-dasharray:6;
    class deposit_reward_ether,deposit_reward_token green

    subgraph Auction
        withdraw_ether
        withdraw_erc20
    end

    subgraph FeeDistributor
        direction LR
        kill
        evacuate
        set_admin
        add_reward
        deposit_reward_token
        deposit_reward_ether
        claim
        claim_many
        claim_multiple_tokens
        claimable_token
        sync_ve
        sync_user_ve
        checkpoint_token
        get_tokens
    end

    subgraph VotingEscrow
        direction LR
        user_point_history
        point_history
    end
```
