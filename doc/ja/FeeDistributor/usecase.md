## アクター

- ユーザ（任意のユーザ、またはコントラクト）
  - 報酬額を取得する
  - 報酬をクレームする
  - 複数アドレス（最大20アドレス）の報酬をまとめてクレームする
  - 複数トークン（最大20トークン）の報酬をまとめてクレームする
- オークションオーナー
  - トークンを引出す
  - ETHを引出す
- [Auction](../Template/index.md)
  - トークンアドレスを追加する
  - FeeDistributorにトークンを送金する
  - FeePoolにトークンを送金する
- FeeDistributorオーナー
  - FeeDistributorを立ち上げる
  - 管理者を変更する
  - 緊急時トークン送金先にトークンを送金する
  - FeeDistributorを非アクティブにする
- FeeDistributor
  - Feeとして徴収した入札トークンをveYMWKホルダーに対して分配する
  - 最大50エポック分のユーザve履歴を取得・保存する
  - 入金された手数料を週ごとに配分して保持する
  - 全体のポイント履歴を取得
  - ユーザのポイント履歴を取得
- [VotingEscrow](./index.md)
  - veYMWKの残高を管理をする
- [FeePool](../FeePool/index.md)
  - トークンを保持する

## ユースケース図

```mermaid
graph LR
    auction_owner{{オークションオーナー}}
    owner{{FeeDistributorオーナー}}
    user{{ユーザ}}
    deploy[FeeDistributorを立ち上げる]
    withdraw_ether[ETHを引出す]
    withdraw_erc20[トークンを引出す]
    add_reward[トークンアドレスを追加する]
    deposit_reward_ether[ETHを入金する]
    deposit_reward_token[トークンを入金する]
    send_fee_eth[ETHを入金する]
    send_fee_erc20[トークンを入金する]
    claim[報酬をクレームする]
    claim_many[複数アドレス（最大20アドレス）の報酬をまとめてクレームする]
    claim_multiple_tokens[複数トークン（最大20トークン）の報酬をまとめてクレームする]
    claimable_token[報酬額を取得する]
    user_point_history[ユーザのポイント履歴を取得]
    point_history[全体のポイント履歴を取得]
    sync_ve[最大20週分のve履歴を取得・保存]
    sync_user_ve[最大50エポック分のユーザve履歴を取得・保存]
    checkpoint_token[入金された手数料を週ごとに配分]
    set_admin[管理者を変更する]
    kill[FeeDistributorを非アクティブにする]
    evacuate[緊急時トークン送金先にトークンを送金する]

    owner --- deploy
    owner --- kill
    owner --- evacuate
    owner --- set_admin

    auction_owner --- withdraw_ether
    auction_owner --- withdraw_erc20

    withdraw_ether -.->|include| send_fee_eth
    withdraw_ether -.->|include| deposit_reward_ether
    withdraw_erc20 -.->|include| send_fee_erc20
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

    claim -.->|include| claimable_token
    claim_many -.->|include| claimable_token
    claim_multiple_tokens -.->|include| claimable_token
    claimable_token -.->|include| sync_ve
    claimable_token -.->|include| checkpoint_token
    claimable_token -.->|include| sync_user_ve

    sync_user_ve -.->|include| user_point_history
    sync_ve -.->|include| point_history

    classDef green fill:#555,stroke-width:2px,stroke-dasharray:6;
    class send_fee_eth,send_fee_erc20,deposit_reward_ether,deposit_reward_token green

    subgraph Auction
        withdraw_ether
        withdraw_erc20
    end

    subgraph FeePool
        direction LR
        send_fee_eth
        send_fee_erc20
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
    end

    subgraph VotinEscrow
        direction LR
        user_point_history
        point_history
    end

```