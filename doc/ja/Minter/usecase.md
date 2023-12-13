## アクター

- Gauge
  - ユーザのミント済みトークン額を取得する
- ユーザ
  - トークンをミント可能額分ミントする
  - ユーザのミント済みトークン額を取得する
  - 指定ユーザによる自身の代替ミント可否を変更する
  - 第三者に代わりトークンをミント可能額分ミントする
- TokenMinter
  - トークンを保持する
  - ゲージコントローラーを保持する
  - ユーザのミント済みトークン額を更新する
  - ユーザのミント済みトークン額を保持する
- TokenMinterオーナー
  - TokenMinterを立ち上げる

## ユースケース図

```mermaid
graph LR
    owner{{TokenMinterオーナー}}
    user{{ユーザ}}
    gauge{{Gauge}}

    mint[トークンをミント可能額分ミントする]
    update_minted[ユーザのミント済みトークン額を更新する]
    get_minted[ユーザのミント済みトークン額を取得する]
    minted[ユーザのミント済みトークン額を保持する]
    toggle_approve_mint[指定ユーザによる自身の代替ミント可否を変更する]
    mint_for[第三者に代わりトークンをミント可能額分ミントする]
    guage_controller[ゲージコントローラーを保持する]
    token[トークンを保持する]

    deploy[TokenMinterを立ち上げる]

    owner --- deploy
    gauge --- get_minted
    user --- get_minted
    user --- mint
    user --- toggle_approve_mint
    user --- mint_for

    subgraph TokenMinter
      direction LR
      token
      guage_controller
      minted
      mint
      get_minted
      update_minted
      toggle_approve_mint
      mint_for
    end
```
