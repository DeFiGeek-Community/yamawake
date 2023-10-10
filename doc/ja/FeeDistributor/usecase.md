## アクター

- ユーザ
  - 任意のユーザ、またはコントラクト
- オークションオーナー
- FeeDistributorオーナー
  - FeeDistributorコントラクトのオーナー
- FeeDistributor
  - Feeとして徴収した入札トークンをveYMWKホルダーに対して分配する
- [VotingEscrow](./index.md)
  - YMWKトークンをロックすることで移転不可のveYMWKを発行する
  - veYMWKの残高を管理をする
- [FeePool](../FeePool/index.md)
  - 各オークション成功時に徴収される入札トークンの集積所
- [Auction](../Template/index.md)

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
    claim_many[複数（最大8トークン）の報酬をまとめてクレームする]
    claimable_token[報酬額を取得する]
    user_point_history[ユーザのポイント履歴を取得]
    point_history[全体のポイント履歴を取得]
    sync_ve[最大20週分のve履歴を取得・保存]
    sync_user_ve[最大50エポック分のユーザve履歴を取得・保存]

    owner --- deploy

    auction_owner --- withdraw_ether
    auction_owner --- withdraw_erc20

    withdraw_ether -.->|include| send_fee_eth
    withdraw_ether -.->|include| deposit_reward_ether
    withdraw_erc20 -.->|include| send_fee_erc20
    withdraw_erc20 -.->|include| deposit_reward_token
    withdraw_erc20 -.->|include| add_reward

    deposit_reward_ether -.->|include| sync_ve
    deposit_reward_token -.->|include| sync_ve

    user --- claim
    user --- claim_many
    user ---|View関数として実行| claimable_token

    claim -.->|include| claimable_token
    claim_many -.->|include| claimable_token
    claimable_token -.->|include| sync_user_ve

    sync_user_ve -.->|include| sync_ve
    sync_user_ve -.->|include| user_point_history
    sync_ve -.->|include| point_history

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
        add_reward
        deposit_reward_token
        deposit_reward_ether
        claim
        claim_many
        claimable_token
        sync_ve
        sync_user_ve
    end

    subgraph VotinEscrow
        direction LR
        user_point_history
        point_history
    end

```
