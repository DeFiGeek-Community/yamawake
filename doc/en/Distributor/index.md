# Distributor

## Overview

Distribute rewards (50 million YMWK) to early users.

Manage scores for each user and distribute based on those scores.

## Features

### Properties

- Holds scores (≒ Mintable amount) for each user.

### Initialization

- Able to set the token.
- Able to set the Factory.

### Claim

- Users can Mint tokens in an amount equivalent to their scores.
- Upon claiming, the user's score is reset to zero.

### Score Addition

- It's possible to increase a specified user's score by a specified amount.
- Only auctions deployed from the Factory can add scores.
