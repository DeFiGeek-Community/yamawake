## アクター

- ユーザ
  - 任意のユーザ、またはコントラクト
- YMWKホルダー
  - YMWKトークンのホルダー
  - EOAとsmart_wallet_checkerでwhitelistされたコントラクトウォレットを想定（コントラクトを弾く理由はveYMWKのトークン化を防ぐため）
    - 参考
      - [smart_wallet_checker](./index.md#smart_wallet_checker-publicaddress)
      - [VotingEscrow](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/VotingEscrow.vy#L109)
- [VotingEscrow](./index.md)
  - YMWKトークンをロックすることで移転不可のveYMWKを発行する
  - veYMWKの残高を管理をする
- [Gauge](../Gauge/index.md)
  - veYMWKホルダーに対するYMWK報酬情報を計算・保持する
- Minter
  - YMWKトークンに設定されたMinter
  - YMWKのmint関数を呼びYMWKを指定数発行する
- [YMWK](../YamawakeToken/index.md)
  - YMWKトークン
- VotingEscrowオーナー
  - VotingEscrowコントラクトのオーナー

## ユースケース

- ユーザ
  - YMWK ロック量を増額する
- YMWKホルダー
  - YMWK をロックする
  - YMWK ロック量を増額する
  - YMWK ロック期間を延長する
  - YMWKを引き出す
- VotingEscrow
  - ユーザのポイント履歴を更新
  - ユーザのポイント履歴を保持する
  - 全体のポイント履歴を更新
  - 全体のポイント履歴を保持する
- Gauge
  - ユーザのポイント履歴を取得する
  - 全体のポイント履歴を取得する
- VotingEscrowオーナー
  - VotingEscrowを立ち上げる
  - 管理者を変更する
  - スマートウォレットチェッカーを変更する

## ユースケース図

```mermaid
graph LR
    classDef transparent fill:none,stroke:none;
    owner{{VotingEscrowオーナー}}
    holder{{YMWKホルダー}}
    user{{ユーザ}}

    create_lock[YMWK をロックする]
    increase_amount[YMWK ロック量を増額する]
    increase_unlock_time[YMWK ロック期間を延長する]
    withdraw[YMWKを引き出す]
    uck[ユーザのポイント履歴を更新]
    ck[全体のポイント履歴を更新]
    integral["
    最大20週分の全体ve履歴を取得・保存
    integrate_inv_supply
    "]
    integral_of[
        最大50ユーザエポック分のve履歴を取得・保存
        integrate_inv_supply_of
        integrate_checkpoint_of
        integrate_fraction
    ]
    ve_total_supply[全体のポイント履歴を取得]
    ve_user_balance[ユーザのポイント履歴を取得]

    mint[ミント]
    rate[インフレーションレートの取得]
    future_epoch_time_write[次回のインフレーションレート変更タイムスタンプ取得]
    update_rate[インフレーションレート更新]
    update_minted[ユーザのミント済みYMWKトークン額を更新]
    minted[ユーザのミント済みYMWKトークン額を取得]
    claim_ymwk[YMWK酬をクレーム]

    deploy[VotingEscrowを立ち上げる]
    change_admin[管理者を変更する]
    change_smchecker[スマートウォレットチェッカーを変更する]


    claimable_tokens[
        YMWK酬額取得
        integrate_fraction
        ]

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
    user ---|View関数として実行| claimable_tokens

    claim_ymwk -.->|include| claimable_tokens
    claim_ymwk -.->|include| mint
    claim_ymwk -.->|include| minted
    claim_ymwk -.->|include| update_minted

    future_epoch_time_write -.->|include| update_rate

    integral_of -.-|include| ve_user_balance
    integral -.-|include| ve_total_supply
    integral -.-|include| rate
    integral -.-|include| future_epoch_time_write

    owner --- deploy
    owner --- change_admin
    owner --- change_smchecker

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
      change_admin
      change_smchecker
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