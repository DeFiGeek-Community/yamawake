# FeeDistributor

## 概要

オークションの手数料をveYMWKホルダーに報酬として分配する

## 機能

### プロパティ

- Factoryのアドレスを保持する
- VotingEscrowのアドレスを保持する
- 報酬の分配を開始するタイムスタンプを保持する
- 報酬トークンのアドレスを保持する
- veYMWK残高の履歴を保持する
- ユーザごとのveYMWK残高の履歴を保持する
- veYMWK残高に対する報酬の割合の履歴をトークン種別ごとに保持する
  - ∫(amount(t) / total_ve_balance(t) dt)
- ユーザごとの報酬の累計をトークン種別ごとに保持する
  - ∫((amount(t) / total_ve_balance(t)) user_ve_balance(t) dt)
- ユーザごとにVotingEscrowに対してアクションが行われた最新のタイムスタンプを保持する
- ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する
- ユーザごとの、ve同期が完了している最後（最新）の履歴のタイムスタンプを保持する
- ユーザごとの、ve同期が完了している最後（最新）の履歴のエポック数を保持する
- 報酬額を週ごと、トークン種別ごとに保持する
- 前回報酬額に変更があった（チェックポイント）時点の報酬額をトークンごとに保持する
- 最後に報酬額に変更があった（チェックポイント）時点のタイムスタンプをトークン種別ごとに保持する
- killed / not killed の状態を保持する
- 緊急時のトークン送金先を保持する
- 管理者のアドレス・次期管理者のアドレスを保持する

### 初期化

- Factoryのアドレスを設定する
- VotingEscrowのアドレスを設定する
- 報酬の分配を開始するタイムスタンプを設定する
- 報酬トークンのアドレスを設定する
- 管理者を設定する
- 緊急時のトークン送金先を設定する

### 機能

#### トークンを追加する

- Auctionのみ
- external
- 引数
  - address\_
    - address
    - トークンのアドレス

#### トークンをデポジットする

- Auctionのみ
- external
- 引数
  - address\_
    - address
    - トークンのアドレス
  - amount\_
    - uint256
    - デポジットする額

#### ETHをデポジットする

- Auctionのみ
- external
- 引数
  - amount\_
    - uint256
    - デポジットする額

#### 報酬をクレームする

- View関数として実行することで報酬額を取得
- external
- 引数
  - address\_
    - address
    - 対象ユーザのアドレス
  - token_address\_
    - address
    - 報酬トークンのアドレス
- 戻り値
  - \_amount
    - uint256
    - 指定トークンの報酬額

#### 複数の報酬をクレームする

- external
- 引数
  - address\_
    - address
    - 対象ユーザのアドレス
  - token_addresses\_
    - address[]
    - 報酬トークンのアドレス配列
    - 最大8トークンまで（要検討）

#### ve履歴を同期する

- internal

#### ユーザのve履歴を同期する

- internal
- 引数
  - address\_
    - address
    - 対象ユーザのアドレス

## 参考

### Curve Contracts

[Curve Liquidity Gauge](https://github.com/curvefi/tricrypto-ng/blob/main/contracts/main/LiquidityGauge.vy)

[Curve Fee Distributor](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/FeeDistributor.vy)
