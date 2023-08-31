# Factory

## Overview

Manages auction templates and deploys auctions.

Serves as an entry point for auction organizers to host auctions.

## Common Specifications

### Auction Template

- Managed by an address corresponding to bytes32 (converted from utf8).
- Overwriting is not allowed.

### Adding Auction Template

- Only the owner can do this.
- Parameters:
  - templateName\_
    - bytes32
    - Name of the auction template
  - templateAddr\_
    - address
    - Address of the auction template
  - initializeSignature\_
    - bytes4
    - Function signature for initializing the auction
  - transferSignature\_
    - bytes4
    - Function signature for token transfer during auction initialization

### Removing Auction Template

- Only the owner can do this.
- Parameters:
  - templateName\_
    - bytes32
    - Name of the auction template

### Applying for Auction Launch

- Parameters:
  - templateName\_
    - bytes32
    - Name of the auction template
  - args\_
    - bytes
    - Set of arguments required for template initialization

### Auction Launch

- Deploy the template using the minimal proxy pattern.
- The instance address is determined by CREATE2 with the template address and nonce (incremented with each auction deployment) as salt.
- The initialization function is executed with a call to the signature specific to the template + arguments.
- Transfer the sales tokens to the auction during deployment.
- The transfer function is executed with a delegatecall to the signature specific to the template + arguments.
- Record the address of the deployed auction.

### Auction Retention

- Retain the deployed auctions in a mapping(address->bool).
