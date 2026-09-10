# Product notes store Predict order ids on-chain

DeepBook Predict 6-24 redeems positions by packed `u256` order id (returned from mint), not by (market key, quantity) as 4-16 did. We record each subscription's order ids in the `ProductNote` itself (`order_ids: vector<u256>`, captured from the mint return values in the same PTB), rather than looking them up from Mysten's Predict indexer (`/manager-orders`) at claim time.

## Considered Options

- **Store in the note (chosen).** Claim is self-contained: note → `redeem_settled` per leg. No off-chain dependency on the claim path.
- **Indexer lookup at claim time.** Avoids a contract redeploy, but makes every claim depend on the availability of a Mysten-operated testnet indexer — an external failure point we refuse to have on the claim path.

## Consequences

- Required a fresh publish of `anker_protocol`; notes from the pre-6-24 deployment are abandoned (their underlying 4-16 positions were already permanently frozen by the upstream migration, so nothing of value was lost).
