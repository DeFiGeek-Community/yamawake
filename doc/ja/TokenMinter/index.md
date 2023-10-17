# TokenMinter

## 概要

Curveの[TokenMinter](https://github.com/curvefi/curve-dao-contracts/blob/master/contracts/Minter.vy)のフォーク。

ユーザからミントのリクエストを受け、ミント可能額をGaugeから取得し、YMWKトークンをミントする

## 機能

### プロパティ

- token: public(address)
  - トークンアドレスを保持する
- controller: public(address)
  - GaugeControllerアドレスを保持する
- minted: public(mapping(address => mapping(address=> uint256)))
  - ユーザごと、Gaugeごとにミント済み額を保持する
- allowedToMintFor: public(mapping(address => mapping(address => bool)))
  - ミンターアドレスごとに指定アドレスへの代替ミント可否フラグを保持する

## 関数

- 初期化

  - tokenを設定する
  - controllerを設定する

- \_mintFor(address gaugeAddr\_, address for\_)

  指定アドレスに対して指定Gauge分のトークンをミントする

  - internal
  - 引数
    - gaugeAddr\_
      - 対象Gaugeのアドレス
    - for\_
      - ミントを実行するアドレス

- mint(address gaugeAddr\_)

  msg.senderに対して指定Gauge分のトークンをミントする

  - external
  - 引数
    - gaugeAddr\_
      - 対象Gaugeのアドレス

- mintMany(address[8] gaugeAddrs\_)

  msg.senderに対して指定Gauge分のトークンをミントする

  - external
  - 引数
    - gaugeAddrs\_
      - 対象Gaugeのアドレス

- mintFor(address gaugeAddr, address for\_)

  指定アドレスに対して指定Gauge分のトークンをミントする

  - external
  - 引数
    - gaugeAddr\_
      - 対象Gaugeのアドレス
    - for\_
      - ミントを実行するアドレス
  - 条件
    - msg.senderがfor\_に対してのミントを許可されている（allowedToMintForがtrue）

- toggleApproveMint(address mintingUser\_)
  指定アドレスに対してmsg.senderの代わりにミントすることを許可する
  - external
  - 引数
    - mintingUser\_
      - 代替ミントを許可するアドレス
