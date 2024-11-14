## Actors

- **GaugeController**

  - Holds the admin
  - Holds the token address
  - Holds the VotingEscrow address
  - Maintains Gauge information
  - Maintains weight information per type
  - Calculates the relative weight of a Gauge

- **GaugeController Owner**

  - Deploys the GaugeController
  - Changes the admin
  - Adds a Gauge

- **User**

  - Gets the type of a Gauge
  - Gets the total weight
  - Gets the relative weight of a Gauge

- **Gauge**

  - Gets the relative weight of the Gauge
  - **Checkpoint**
    - Does nothing in V1

- **Minter**
  - Gets the type of a Gauge

## Use Case Diagram

```mermaid
graph LR
    user{{"User"}}
    owner{{"GaugeController Owner"}}
    gauge_{{"Gauge"}}
    minter{{"Minter"}}

    admin["Holds the admin"]
    token["Holds the token address"]
    escrow["Holds the VotingEscrow address"]
    gauge["Maintains Gauge information"]

    deploy["Deploy GaugeController"]
    change_admin["Change admin"]
    add_gauge["Add Gauge"]

    get_gauge_rel_weight["Get the relative weight of a Gauge"]
    get_gauge_type["Get the type of a Gauge"]

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
