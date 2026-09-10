# Sponsored Send opens the transfer fence — for the pure-dUSDC-transfer shape only

ADR-0009 fenced the unauthenticated sponsor endpoint with two server-side constraints: move calls limited to the protocol's own targets, and transfers allowed only back to the sender. Send (转出, the embedded wallet's transfer-out action) breaks the second constraint by definition — its whole point is moving dUSDC to a CEX deposit address, and the users who need it most (Enoki zkLogin sessions) own no SUI to pay their own gas.

The fence now has one deliberate door. When the sponsor request carries a `recipient`, the server switches to a *stricter* regime than the default: `allowedMoveCallTargets` shrinks to the send allowlist (`sendSponsoredMoveCallTargets` — the wrapper sweep pair `account::generate_auth`/`account::withdraw_funds` plus the `coinWithBalance` framework calls), `allowedAddresses` becomes `[sender, recipient]`, and the transaction kind must pass a structural gate (`assertSendTransactionShape`): only `MoveCall`/`SplitCoins`/`MergeCoins`/`TransferObjects` commands, every Move type argument equal to the quote asset, at least one transfer, and no `GasCoin` argument anywhere. Requests without a `recipient` keep the exact ADR-0009 behavior.

## Considered Options

- **Recipient-scoped send regime with structural validation (chosen).** The send door cannot reach subscribe/claim targets, cannot touch the sponsor's gas coin, and each request names exactly one recipient. The client builds the same shape (`buildSendDusdcTransaction`), so legitimate sends always pass.
- **Keep the fence; zkLogin users self-pay gas for Send.** Self-defeating: the target user has no SUI and no way to buy it — Send would ship dead for exactly the CEX audience it was designed for.
- **Sponsor arbitrary transfers with rate limiting.** Requires counting infrastructure (per-address quotas, storage) before it is safe; overweight for testnet and still needed later anyway (see below).

## Consequences

- **Known residual gap:** coin *objects* passed as transaction inputs cannot be type-checked from kind bytes alone (resolving their types would need chain lookups). A stranger can therefore have us sponsor gas for transferring *their own* coins of any type to one recipient per request. On testnet the cost is free-tier sponsorship credits; acceptable. **Before mainnet this door needs a budget guard** — per-address rate limits or server-side object-type resolution — tracked as the follow-up to this ADR.
- The send allowlist is drift-tested like ADR-0009's (`enokiSponsor.test.ts`): the sweep-send plan's targets must stay inside `sendSponsoredMoveCallTargets`, and the shape gate has accept/reject coverage.
- The sweep pair means Send can drain the sender's own AccountWrapper idle balance — that is intentional (Available 可用 is one number everywhere; Send must be able to move all of it), and `withdraw_funds` still authorizes against the sender's own wrapper on-chain.
- ADR-0008 digest custody is unchanged: sponsored sends go through the same create → sign-exact-bytes → execute exchange as every other sponsored flow.
