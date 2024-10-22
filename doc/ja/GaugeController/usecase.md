## アクター

- GaugeController

  - 管理者を保持する
  - トークンアドレスを保持する
  - VotingEscrowアドレスを保持する
  - Gauge情報を保持する
  - TypeごとのWeight情報を保持する
  - Gaugeの相対Weightを計算する

- GaugeControllerオーナー
  - GaugeControllerを立ち上げる
  - 管理者を変更する
  - Gaugeを追加する
- ユーザ
  - GaugeのTypeを取得する
  - Weightの合計を取得する
  - Gaugeの相対Weightを取得する
- Gauge
  - Gaugeの相対Weightを取得する
  - checkpoint
    - V1では何もしない
- Minter
  - GaugeのTypeを取得する

## ユースケース図

```mermaid
graph LR
    user{{"ユーザ"}}
    owner{{"GaugeControllerオーナー"}}
    gauge_{{"Gauge"}}
    minter{{"Minter"}}

    admin["管理者を保持する"]
    token["トークンアドレスを保持する"]
    escrow["VotingEscrowアドレスを保持する"]
    gauge["Gauge情報を保持する"]

    deploy["GaugeControllerを立ち上げる"]
    change_admin["管理者を変更する"]
    add_gauge["Gaugeを追加する"]

    get_gauge_rel_weight["Gaugeの相対Weightを取得する"]
    get_gauge_type["GaugeのTypeを取得する"]

    owner --- deploy
    owner --- change_admin
    owner --- add_gauge

    user --- get_gauge_rel_weight

    gauge_ --- get_gauge_rel_weight

    minter --- get_gauge_type

    subgraph GaugeController
        direction LR
        admin
        token
        escrow
        gauge

        get_gauge_type
        get_gauge_rel_weight

        change_admin
        add_gauge
    end
```
