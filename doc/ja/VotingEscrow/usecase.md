## アクター

- ユーザ
  - 任意のユーザ、またはコントラクト
- YMWKホルダー
  - YMWKトークンのホルダー
  - EOA、コントラクトを想定
- [VotingEscrow](./index.md)
  - YMWKトークンをロックすることで移転不可のveYMWKを発行する
  - veYMWKの残高を管理をする
- [RewardGauge](../RewardGaugeV1/index.md)
  - veYMWKホルダーに対するYMWK報酬情報を計算・保持する
- [Minter](../MinterV1/index.md)
  - YMWKトークンに設定されたMinter
  - YMWKのmint関数を呼びYMWKを指定数発行する
- [YMWK](../YamawakeToken/index.md)
  - YMWKトークン

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
- GaugeController
  - GaugeのWeightを取得する

## ユースケース図

```mermaid
graph LR
    classDef transparent fill:none,stroke:none;
    holder{{"YMWKホルダー"}}
    user{{"ユーザ"}}

    create_lock["YMWKをロックする"]
    increase_amount["YMWKロック量を増額する"]
    increase_unlock_time["YMWKロック期間を延長する"]
    withdraw["YMWKを引き出す"]
    uck["ユーザのポイント履歴を更新"]
    ck["全体のポイント履歴を更新"]
    integral["最大20週間分のveYMWK総残高を取得・保存"]
    integral_of["最大50エポック分のユーザve履歴を取得し、エポック数を保持"]
    ve_total_supply["全体のポイント履歴を取得"]
    ve_user_balance["ユーザのポイント履歴を取得"]

    mint["ミント"]
    rate["インフレーションレートの取得"]
    future_epoch_time_write["次回のインフレーションレート変更タイムスタンプ取得"]
    update_rate["インフレーションレート更新"]
    update_minted["ユーザのミント済みYMWKトークン額を更新"]
    minted["ユーザのミント済みYMWKトークン額を取得"]
    claim_ymwk["YMWK報酬をクレーム"]

    integrate_fraction["現状態でのYMWK酬額額の取得 integrateFraction"]
    claimable_tokens["各種状態を最新に更新した上でYMWK酬額額の取得 claimableTokens"]

    gauge_relative_weight["GaugeのWeightを取得する"]

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
    user ---|View関数として実行| claimable_tokens

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
