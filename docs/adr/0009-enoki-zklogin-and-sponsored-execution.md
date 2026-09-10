# Enoki zkLogin sessions execute gas-sponsored through Enoki; extension wallets keep self-executing

Google sign-in (Enoki zkLogin, registered in `src/sui/enokiWallets.ts`) creates Sui addresses that own no SUI, so those users cannot pay gas. Enoki sponsorship in its current portal generation only works with the *private* API key, which forces a backend exchange: the client builds the gasless transaction kind, our API routes (`app/api/enoki/sponsor`, backed by `src/server/enokiSponsor.ts`) ask Enoki to wrap it with sponsored gas, the wallet signs those exact bytes, and Enoki — holding the sponsor signature — submits. All wallet flows now go through one seam, `executeWalletTransaction` in `src/sui/transactionExecution.ts`: sponsored when the connected wallet is an Enoki wallet *and* the deployment has `ENOKI_PRIVATE_API_KEY`, otherwise the ADR-0008 sign-only + self-execute path, unchanged, for extension wallets.

## Considered Options

- **Sponsor Enoki sessions only (chosen).** zkLogin users are the ones who cannot pay; extension-wallet users keep the battle-tested direct path with zero behavior change, and the sponsorship budget is not spent where it buys nothing.
- **Sponsor every wallet.** Free on testnet but burns paid credits per transaction on mainnet, and turns every extension-wallet regression into a sponsorship-path regression.
- **Frontend-only sponsorship with the public key.** The current Enoki portal cannot enable sponsored transactions on public keys; not available.

## Consequences

- ADR-0008's "the app chooses the fullnode that receives the transaction" no longer holds for sponsored executions — Enoki submits those. The digest, however, is returned by the *create* step before execution, and confirmation still runs on the app's own client (`waitForTransaction`), so digest custody — the actual point of ADR-0008 — is preserved. As a guard, the client refuses to execute if the wallet re-signs different bytes than Enoki sponsored.
- The sponsor endpoint is unauthenticated by design (any sender can only sponsor transactions it can itself sign), but it is constrained server-side: move calls are limited to the protocol's own targets (`sponsoredMoveCallTargets`, drift-tested against the transaction-plan builders in `src/server/enokiSponsor.test.ts`) and transfers to the sender itself.
- New Move call targets added to any transaction plan must also be added to `sponsoredMoveCallTargets`, or sponsored execution of that flow fails; the drift test turns this into a unit-test failure instead of a runtime surprise. Two Enoki matching gotchas learned live: build-time intent resolution emits framework calls that never appear in plan `calls` (`coinWithBalance` → `0x2::coin::redeem_funds`/`send_funds`/`destroy_zero`), and Enoki only matches fully-normalized 64-char package addresses — a `0x2::` entry silently never matches.
- Without `ENOKI_PRIVATE_API_KEY` the app still works: the probe (`GET /api/enoki/sponsor`) reports disabled and Enoki sessions fall back to self-paid gas (which then requires faucet SUI on the zkLogin address).
