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
  - veYMWKホルダーに対するリワード情報の管理をする
- Minter
  - YMWKトークンに設定されたMinter
  - YMWKのmint関数を呼びYMWKを指定数発行する
- [YMWK](../YamawakeToken/index.md)
  - YMWKトークン

## ユースケース図

```mermaid
graph LR
    holder{{YMWKホルダー}}
    user{{ユーザ}}

    create_lock[YMWK をロックする]
    increase_amount[YMWK ロック量を増額する]
    increase_unlock_time[YMWK ロック期間を延長する]
    withdraw[YMWKを引き出す]
    uck[ユーザのポイント履歴を更新]
    ck[全体のポイント履歴を更新]
    integral["
    更新
    integrate_inv_supply
    "]
    integral_of[
        更新
        integrate_inv_supply_of
        integrate_fraction
    ]
    calc_reward[ユーザの総YMWKリワード額を計算]

    mint[ミント]
    mintable_in_timeframe[
      現時点までのインフレーションにより
      発行可能なYMWK総額の取得
      mintable_in_timeframe
    ]
    update_rate[インフレーションレート更新]
    update_minted[ユーザのミント済みYMWKトークン額を更新]
    minted[ユーザのミント済みYMWKトークン額を取得]
    claim_ymwk[YMWKリワードをクレーム]

    integrate_fraction[
        全体veYMWKに対する
        ユーザveYMWKの時間に対する積分値取得
        integrate_fraction
        ]


    holder --- create_lock
    holder --- increase_amount
    holder --- increase_unlock_time
    holder --- withdraw
    create_lock -.->|include| uck
    increase_amount -.->|include| uck
    increase_unlock_time -.->|include| uck
    withdraw -.->|include| uck
    uck -.->|include| ck
    uck -.->|include| integral_of
    user --- ck
    user --- increase_amount

    calc_reward -.->|include| integrate_fraction
    calc_reward -.->|include| mintable_in_timeframe
    user ---> holder

    user --- claim_ymwk


    claim_ymwk -.->|include| calc_reward
    claim_ymwk -.->|include| mint
    claim_ymwk -.->|include| minted
    claim_ymwk -.->|include| update_minted
    mint -.->|include| update_rate

    ck -.->|include| integral

    style calc_reward fill:#a44,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5
    style integrate_fraction fill:#a44,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5
    style integral fill:#a44,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5
    style integral_of fill:#a44,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5

    subgraph Gause
      calc_reward
    end

    subgraph VotingEscrow
      direction LR
      create_lock
      increase_amount
      increase_unlock_time
      withdraw
      uck
      ck
      integrate_fraction
      integral_of
      integral
    end

    subgraph YMWK
      direction LR
      mint
      update_rate
      mintable_in_timeframe
    end
    subgraph Minter
      direction LR
      claim_ymwk
      minted
      update_minted
    end
```
