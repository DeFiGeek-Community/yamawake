# Yamawake

## Overview

Permissionless Auction Platform

Users can sell any token in auction formats specified by the provided templates.

## Components

### V1

#### [Distributor](./Distributor/index.md)

#### [Factory](./Factory/index.md)

#### [Template](./Template/index.md)

#### [FeePool](./FeePool/index.md)

#### [Yamawake DAO Token](./YamawakeToken/index.md)

### V1.5

#### [VotingEscrow](./VotingEscrow/index.md)

Lock YMWK tokens to issue non-transferable veYMWK tokens. Forked from Curve's VotingEscrow.

#### [FeeDistributorV1](./FeeDistributorV1/index.md)

Distributes auction fees as rewards to veYMWK holders. Forked from Curve's FeeDistributor.

#### [GaugeControllerV1](./GaugeControllerV1/index.md)

Manages the weights for each Gauge. Forked from Curve's GaugeController.

#### [RewardGaugeV1](./RewardGaugeV1/index.md)

Calculates and maintains YMWK token rewards for veYMWK holders. Forked from Curve's LiquidityGauge.

#### [MinterV1](./MinterV1/index.md)

Receives mint requests from users, retrieves the mintable amount from the Gauge, and mints YMWK tokens. Forked from Curve's TokenMinter.

#### [TemplateV1.5](./Template/V1.5/index.md)

IBAO (Initial Bulk Auction Offering) Template

## Use case Diagram

### Voting Escrow

[VotingEscrow Use case Diagram](./VotingEscrow/usecase.md)

### Fee Distribution

[FeeDistributor Use case Diagram](./FeeDistributorV1/usecase.md)
