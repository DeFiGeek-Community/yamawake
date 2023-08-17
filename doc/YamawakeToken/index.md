# Yamawake DAO Token (YMWK)

## 概要

Curve Dao TokenをベースにしたERC20トークン。初期発行量450,000,000とし、1年目55,000,000、年次逓減10％で235年に渡って発行する。発行量は最終的に1,000,000,000に収束する。

## 登場するロール

- Minter: 予め設定された範囲内の発行数までを指定数Mintできる
- Admin: Minterを指定できる

## 機能

### 定数

- INITIAL_SUPPLY: 初期発行量
- INITIAL_RATE: 初期に設定する発行可能量上昇レート
- RATE_REDUCTION_TIME: 単位時間当たりの発行量が更新される期間
- RATE_REDUCTION_COEFFICIENT: 逓減率
- RATE_DENOMINATOR: 発行可能量上昇レートの計算で使用する定数

### プロパティ

- 1つのMinterアドレスを保持できる
- 1つのAdminアドレスを保持できる
- エポック数を保持できる
- エポック数のスタート時間を保持できる
- 単位時間当たりの発行可能量上昇レート

### 初期化

- Adminを設定できる
- 初期発行数を設定できる
- 指定枚数をMintできる
- エポック数を設定できる
- エポック数のスタート時間を設定できる
- 単位時間当たりの発行可能量上昇レートを設定できる

### update_mining_parameters

- 単位時間当たりの発行可能量上昇レートを更新する

### start_epoch_time_write

- 現在のエポックのスタート時間を返却する
- 単位時間当たりの発行可能量上昇レートを更新する

### future_epoch_time_write

- 次回のエポックのスタート時間を返却する
- 単位時間当たりの発行可能量上昇レートを更新する

### available_supply

- 現在の発行可能数を取得できる

### mintable_in_timeframe

- 指定した期間に発行可能な量を返却する

### set_minter

- AdminはMinterを1度だけ設定できる

### set_admin

- AdminはAdminを設定できる

### mint

- Minterは指定枚数をMintし、現発行量を加算できる
