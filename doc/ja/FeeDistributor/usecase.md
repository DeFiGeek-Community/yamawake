## アクター

- ユーザ（任意のユーザ、またはコントラクト）
  - 報酬額を取得する
  - 報酬をクレームする
  - 複数アドレス（最大20アドレス）の報酬をまとめてクレームする
  - 複数トークン（最大20トークン）の報酬をまとめてクレームする
  - 報酬トークンの一覧を取得する
- オークションオーナー
  - トークンを引出す
  - ETHを引出す
- [Auction](../Template/index.md)
  - トークンアドレスを追加する
  - FeeDistributorにトークンを送金する
- FeeDistributorオーナー
  - FeeDistributorを立ち上げる
  - 管理者を変更する
  - 緊急時トークン送金先にトークンを送金する
  - FeeDistributorをkill状態にする
- FeeDistributor

  - 入金された手数料を週ごとに配分して保持する
  - 週ごとに配分された報酬をveYMWKホルダーに対して各週のveYMWK残高に応じて分配する
  - 最大50エポック分のユーザve履歴を取得し、エポック数を保持する
  - 最大20週間分のveYMWK総残高を取得
  - 各週初め時点でのveYMWK総残高を保持する

- [VotingEscrow](./index.md)
  - veYMWKの残高を管理をする

## ユースケース図

```mermaid
graph LR
    auction_owner{{"オークションオーナー"}}
    owner{{"FeeDistributorオーナー"}}
    user{{"ユーザ"}}
    deploy["FeeDistributorを立ち上げる"]
    withdraw_ether["ETHを引出す"]
    withdraw_erc20["トークンを引出す"]
    add_reward["トークンアドレスを追加する"]
    deposit_reward_ether["ETHを入金する"]
    deposit_reward_token["トークンを入金する"]
    claim["報酬をクレームする"]
    claim_many["複数アドレス（最大20アドレス）の報酬をまとめてクレームする"]
    claim_multiple_tokens["複数トークン（最大20トークン）の報酬をまとめてクレームする"]
    claimable_token["報酬額を取得する"]
    get_tokens["報酬トークンの一覧を取得する"]
    user_point_history["ユーザのポイント履歴を取得"]
    point_history["全体のポイント履歴を取得"]
    sync_ve["最大20週間分のveYMWK総残高を取得・保存"]
    sync_user_ve["最大50エポック分のユーザve履歴を取得し、エポック数を保持"]
    checkpoint_token["入金された手数料を週ごとに配分"]
    set_admin["管理者を変更する"]
    kill["FeeDistributorをkill状態にする"]
    evacuate["緊急時トークン送金先にトークンを送金する"]

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
    user ---|View関数として実行| claimable_token
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

    subgraph VotinEscrow
        direction LR
        user_point_history
        point_history
    end

```
