# Actors

- Factory Owner
  - Launch the factory
  - Add auction templates
  - Remove auction templates
- Factory
  - Hold auction templates
  - Launch auctions
- Auction Organizer
  - Apply to launch an auction

# Use Case Diagram

```mermaid
graph LR
    fow{{Factory Owner}}
    sow{{Auction Organizer}}

    fow-->FOW1[Launch the factory]
    fow-->FOW2[Add auction template]
    fow-->FOW3[Remove auction template]

    F1[Hold auction template]
    F2[Launch auction]

    sow-->SOW1[Apply to launch an auction]

    subgraph Factory
        F1
        F2
        FOW2
        FOW3
        SOW1
    end
```