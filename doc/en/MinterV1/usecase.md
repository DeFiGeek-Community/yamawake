## Actors

- **Gauge**
  - Get the amount of tokens minted by users
- **User**
  - Mint tokens up to the amount that can be minted
  - Get the amount of tokens minted by the user
  - Change approval for specified users to mint on their behalf
  - Mint tokens up to the amount that can be minted on behalf of a third party
- **TokenMinter**
  - Holds the token
  - Holds the Gauge Controller
  - Updates the amount of tokens minted by users
  - Holds the amount of tokens minted by users
- **TokenMinter Owner**
  - Deploys the TokenMinter

## Use Case Diagram

```mermaid
graph LR
    owner{{TokenMinter Owner}}
    user{{User}}
    gauge{{Gauge}}

    mint[Mint tokens up to the amount that can be minted]
    update_minted[Update the amount of tokens minted by the user]
    get_minted[Get the amount of tokens minted by the user]
    minted[Holds the amount of tokens minted by users]
    toggle_approve_mint[Change approval for specified users to mint on their behalf]
    mint_for[Mint tokens up to the amount that can be minted on behalf of a third party]
    gauge_controller[Holds the Gauge Controller]
    token[Holds the token]

    deploy[Deploy the TokenMinter]

    owner --- deploy
    gauge --- get_minted
    user --- get_minted
    user --- mint
    user --- toggle_approve_mint
    user --- mint_for

    subgraph TokenMinter
      direction LR
      token
      gauge_controller
      minted
      mint
      get_minted
      update_minted
      toggle_approve_mint
      mint_for
    end
```
