# Deploying to Vercel

## Fastest path (CLI)

```bash
vercel login                      # interactive — do this first
bash scripts/vercel-setup.sh      # links the project and pushes all 10 env vars
vercel --prod
```

The setup script is idempotent and never sends `BURNER_PRIVATE_KEY`. After the
first deploy, correct `NEXT_PUBLIC_SITE_URL` to the real alias and redeploy —
`NEXT_PUBLIC_*` values are baked in at build time.

---

## Or via the dashboard

### 1 · Import the repo

Vercel → **Add New… → Project** → import `Aaditya1273/linger` → Framework preset
**Next.js** (detected). Leave build and output settings at their defaults; the
repo's `vercel.json` supplies the rest.

## 2 · Environment variables

Add these to **Production** *and* **Preview**. Every `NEXT_PUBLIC_*` value is
inlined into the client bundle at build time, so after changing one you must
**Redeploy** — a runtime-only env change does nothing.

| Variable | Value | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` | Canonical + Open Graph base. Set this or social previews resolve to localhost. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | your Reown project id | Enables the WalletConnect QR path. Injected wallets work without it. |
| `NEXT_PUBLIC_ANKER_NOTE_ADDRESS` | `0x863b54bb144cec7ae73d56983193e2e5a60652e3` | Deployed AnkerNote. Without it the portfolio says the contract is unconfigured. |
| `NEXT_PUBLIC_REPO_URL` | `https://github.com/Aaditya1273/linger` | Footer + methodology link. |
| `INDEXER_URL` | `https://dev.smk.somnia.host/v1/graphql` | DreamDEX indexer (server-side reads). |
| `SOMNIA_RPC` | `https://dream-rpc.somnia.network` | Shannon JSON-RPC. |
| `WS_RPC` | `wss://dream-rpc.somnia.network/ws` | Shannon websocket. |
| `NEXT_PUBLIC_INDEXER_URL` | same as `INDEXER_URL` | Browser subscribe path. |
| `NEXT_PUBLIC_SOMNIA_RPC` | same as `SOMNIA_RPC` | wagmi transport. |
| `NEXT_PUBLIC_WS_RPC` | same as `WS_RPC` | Browser subscribe path. |

**Do NOT set `BURNER_PRIVATE_KEY` on Vercel.** It is only for the local
`smoke` / `deploy` / `note:lifecycle` scripts. A deployed frontend never signs —
the user's wallet does.

Optional: `DATABASE_URL` (Neon) to serve the Benchmark archive from Postgres
instead of the bundled observation window. Unset is fine and is what the demo
uses.

## 3 · Node version

`package.json` pins `engines.node` to `>=20 <25`. Vercel honours that; if the
dashboard offers a Node version, pick **22.x**. Node 25+ breaks the jsdom-based
tests (`window.localStorage` is undefined there).

## 4 · Install command — already handled

`vercel.json` pins `installCommand: npm install --legacy-peer-deps`. The tree needs
it: wagmi's connector barrel pulls an optional peer set npm cannot resolve cleanly,
and without the flag the build dies at install with an arborist `edgesOut` error.
Nothing to configure in the dashboard.

## 5 · Deploy

Push to `main`, or hit **Deploy**. Then check:

- `/` → 307 → `/en` (landing page)
- `/en/app/dual-investment` → bounces back to `/en` until a wallet connects
- `/api/markets` → 200 with a `markets` array
- `/api/polymarket` → 200 with `thresholds`

## Known production behaviour

**First request after a cold start is slow.** The DreamDEX indexer takes ~7s on a
good call and occasionally connect-times-out. The route has a 7.5s hard budget: it
answers with stale data or a 503 + `retry-after` rather than being killed at the
platform's timeout, and the refresh keeps running in the background so the next
request is warm (~5ms). This is an upstream latency characteristic, not a bug in
the app — but it is why the data routes carry an explicit `maxDuration`.

For the demo, **load the app once before recording**.

**Serverless caches are per-container.** The in-memory warm cache is not shared
across Vercel instances, so a fanned-out load will cold-start more than once.
`s-maxage` on the responses lets Vercel's CDN absorb repeats.
