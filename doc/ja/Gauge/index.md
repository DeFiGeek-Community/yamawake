# Gauge

## 概要

[veYMWK](../VotingEscrow/index.md)ホルダーに対する[YMWKトークン](../YamawakeToken/index.md)報酬を計算・保持する。

## 機能

### プロパティ

- veYMWK残高に対するYMWKインフレーション量の割合の履歴を保持する
  - ∫(r(t) \* w(t) / total_ve_balance(t) dt)
- ユーザごとのveYMWK残高の履歴を保持する
  - ∫(user_ve_balance(t) dt)
- ユーザごとのYMWK報酬の累計を保持する
  - ∫((r(t) \* w(t) / total_ve_balance(t)) user_ve_balance(t) dt)
- ユーザごとにVotingEscrowに対してアクションが行われた最新のタイムスタンプを保持する
- veYMWKの同期が行われた最後の履歴のタイムスタンプを保持する
- ユーザごとにveYMWKの同期が行われた最後の履歴のタイムスタンプを保持する
- ユーザごとにveYMWKの同期が行われた最後の履歴のエポック数を保持する
- YMWKトークンのインフレーションレートを保持する
- YMWKトークンの次回のインフレーションレート変更タイムスタンプを保持する

### 初期化

- Minterのアドレスを設定する
- Voting Escrowのアドレスを設定する
- Gauge Controllerのアドレスを設定する
- YMWKトークンのアドレスを設定する

### veYMWK残高に対するYMWKインフレーション量の割合の履歴を更新する

- 最後に同期された時点から20週分に渡りveYMWK残高をVoting Escrowから情報を取得する
- Gauge ControllerからWeightを取得する
- YMWKトークンのインフレーションレートの更新タイムスタンプを跨ぐ場合はYMWKトークンのインフレーションレートと次回のインフレーションレート更新タイムスタンプを更新する
- それぞれの週について、veYMWK残高に対するYMWKインフレーション量の割合を計算し履歴を更新する
- 履歴のタイムスタンプを更新する

### ユーザごとのYMWK報酬を更新する

- 最後に同期されたユーザの履歴から最大50回分の履歴を取得する
- それぞれの履歴が発生した週について、YMWK報酬を計算し、記録する
- 履歴のタイムスタンプ、エポック数を更新する

## 参考

### YMWK報酬簡易シミュレーション

https://www.desmos.com/calculator/uslkumq90d

### Curve Contracts

[Curve Liquidity Gauge](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

[Curve Fee Distributor](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/FeeDistributor.vy)
