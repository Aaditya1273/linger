# Wallets sign; the app executes — never dAppKit.signAndExecuteTransaction

Every wallet transaction (create container, subscribe, claim) goes through `signAndExecuteWithWallet` in `src/sui/walletExecution.ts`: the wallet only signs (`dAppKit.signTransaction`), and the app submits the signed bytes through its own gRPC client (`client.executeTransaction`). The bridge this replaces — `dAppKit.signAndExecuteTransaction` — has a fallback for wallets lacking the modern `sui:signAndExecuteTransaction` feature (the Slush extension among them) that executes the transaction on-chain, then blindly destructures the wallet-returned `rawTransaction` as vector-wrapped `SenderSignedData`. When a wallet encodes that field differently, the destructure throws `Cannot read properties of undefined (reading 'txSignatures')` *after* execution and discards the digest the wallet already returned: the user's funds moved, but the dApp reports failure and cannot even link the transaction. Both subscribe and claim hit this in production with the Slush extension. The defect is present up through dapp-kit-core 1.6.5, so a dependency bump is not a fix. `signTransaction` is immune on both wallet feature generations — the modern feature returns `{bytes, signature}` verbatim and the legacy fallback destructures plain named fields, no BCS parsing — and self-execution keeps the digest under app control unconditionally.

## Considered Options

- **Sign-only + self-execute (chosen).** Parse-free on every wallet generation; the digest comes from our own execute call; the result shape (`{$kind, Transaction/FailedTransaction}`) is identical to what the components already consumed.
- **Keep signAndExecuteTransaction, catch the parse error.** By the time it throws, the digest is gone; recovery would mean scraping the chain for "the sender's most recent transaction" — racy and unverifiable.
- **Wait for an upstream fix.** Filed as the right long-term outcome, but user wallet versions and Mysten release cadence are outside our control; the app needs to work now.

## Consequences

- The app, not the wallet, chooses the fullnode that receives the transaction — submission reliability is ours to own, which is consistent with the app already owning preflight simulation and confirmation (`waitForTransaction`).
- Wallets that implement *only* `sui:signAndExecuteTransaction*` and no sign-only feature would not work; no known wallet ships execute-only features (signing is the wallet-standard baseline), so no fallback is kept.
- New wallet flows must call `signAndExecuteWithWallet` rather than reaching for the dApp Kit method that looks like the obvious one-liner.
