# DeepHarbor V1 App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frontend-first DeepHarbor dApp that reads live DeepBook Predict market data, quotes structured product legs through an execution-agnostic adapter, compiles Dual Investment and Shark Fin products, simulates payoff outcomes, and displays leg transparency.

**Architecture:** Use a React/Vite TypeScript app with focused domain modules. Sui-specific code is isolated in `src/sui/*`, market fetching in `src/deepbook/*`, product math in `src/products/*`, and UI components in `src/components/*`; the app can later swap quote/execution adapters without rewriting compiler or simulator logic.

**Tech Stack:** React, Vite, TypeScript, Vitest, Testing Library, Playwright, `@mysten/dapp-kit-react`, `@mysten/sui`, `@tanstack/react-query`, `lucide-react`, `recharts`.

---

## File Structure

Create these files:

```text
package.json
index.html
tsconfig.json
tsconfig.node.json
vite.config.ts
vitest.config.ts
playwright.config.ts
src/main.tsx
src/App.tsx
src/styles.css
src/config/deepbook.ts
src/sui/dappKit.ts
src/sui/executionAdapter.ts
src/deepbook/predictServer.ts
src/deepbook/quoteProvider.ts
src/deepbook/fixtures.ts
src/products/types.ts
src/products/units.ts
src/products/strikeGrid.ts
src/products/dualInvestment.ts
src/products/sharkFin.ts
src/products/payoff.ts
src/hooks/useMarketData.ts
src/hooks/useStructuredQuote.ts
src/components/AppShell.tsx
src/components/ProductBuilder.tsx
src/components/PresetQuoteBoard.tsx
src/components/QuoteSummary.tsx
src/components/PayoffChart.tsx
src/components/TransparencyPanel.tsx
src/components/ScenarioCards.tsx
src/test/setup.ts
src/test/fixtures/oracleState.json
src/test/fixtures/status.json
src/products/strikeGrid.test.ts
src/products/dualInvestment.test.ts
src/products/sharkFin.test.ts
src/products/payoff.test.ts
src/deepbook/predictServer.test.ts
tests/deepharbor.spec.ts
```

Responsibilities:

- `src/config/deepbook.ts`: current testnet package/object/quote asset/server constants.
- `src/sui/dappKit.ts`: Sui dApp Kit provider setup using testnet gRPC.
- `src/sui/executionAdapter.ts`: future transaction adapter interface.
- `src/deepbook/predictServer.ts`: public server fetch and parsing.
- `src/deepbook/quoteProvider.ts`: normalized quote provider interface plus current live/snapshot implementation.
- `src/products/*`: product types, units, strike rounding, compilers, and payoff simulator.
- `src/hooks/*`: UI orchestration around market and quote state.
- `src/components/*`: product workbench UI.
- `src/test/*` and `tests/*`: unit and browser smoke tests.

## Task 1: Scaffold The React/Vite Project

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create the project manifest**

Write `package.json`:

```json
{
  "name": "deepharbor",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "tsc -b --pretty false"
  },
  "dependencies": {
    "@mysten/dapp-kit-react": "^2.0.3",
    "@mysten/sui": "^2.17.0",
    "@tanstack/react-query": "^5.80.0",
    "lucide-react": "^0.468.0",
    "recharts": "^2.15.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^15.0.7",
    "@types/react": "^18.3.23",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.5.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Create the HTML entry**

Write `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DeepHarbor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create TypeScript configs**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Write `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Create Vite, Vitest, and Playwright configs**

Write `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
```

Write `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

Write `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
});
```

Write `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and the install exits with code 0.

- [ ] **Step 6: Run initial checks**

Run:

```bash
npm run lint
npm test
```

Expected: both commands fail because app source files have not been created.

- [ ] **Step 7: Commit scaffold files**

Run:

```bash
git add package.json package-lock.json index.html tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts playwright.config.ts src/test/setup.ts
git commit -m "chore: scaffold DeepHarbor frontend"
```

## Task 2: Add App Providers, Sui dApp Kit, And Base Styling

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/config/deepbook.ts`
- Create: `src/sui/dappKit.ts`
- Create: `src/sui/executionAdapter.ts`

- [ ] **Step 1: Add DeepBook constants**

Write `src/config/deepbook.ts`:

```ts
export const PREDICT_SERVER_URL = 'https://predict-server.testnet.mystenlabs.com';

export const DEEPBOOK_PREDICT = {
  packageId: '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138',
  predictObjectId: '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
  quoteAssetType: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
  underlyingAsset: 'BTC',
} as const;

export const TESTNET_GRPC_URL = 'https://fullnode.testnet.sui.io:443';
```

- [ ] **Step 2: Add dApp Kit setup**

Write `src/sui/dappKit.ts`:

```ts
import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { TESTNET_GRPC_URL } from '../config/deepbook';

export const dAppKit = createDAppKit({
  networks: ['testnet'],
  defaultNetwork: 'testnet',
  createClient: (network) =>
    new SuiGrpcClient({
      network,
      baseUrl: TESTNET_GRPC_URL,
    }),
});

declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
```

- [ ] **Step 3: Add execution adapter boundary**

Write `src/sui/executionAdapter.ts`:

```ts
import type { StructuredProductQuote } from '../products/types';

export type ExecutionState = 'disabled' | 'preview-only' | 'ready';

export interface OpenTransactionRequest {
  quote: StructuredProductQuote;
}

export interface RedeemTransactionRequest {
  ownerAddress: string;
  productId: string;
}

export interface ExecutionAdapter {
  state: ExecutionState;
  buildOpenTransaction(request: OpenTransactionRequest): Promise<never>;
  buildRedeemTransaction(request: RedeemTransactionRequest): Promise<never>;
  trackPositions(ownerAddress: string): Promise<[]>;
}

export const previewOnlyExecutionAdapter: ExecutionAdapter = {
  state: 'preview-only',
  async buildOpenTransaction() {
    throw new Error('DeepHarbor V1 is quote-and-preview only until the execution adapter is enabled.');
  },
  async buildRedeemTransaction() {
    throw new Error('DeepHarbor V1 is quote-and-preview only until the execution adapter is enabled.');
  },
  async trackPositions() {
    return [];
  },
};
```

- [ ] **Step 4: Add React entry and provider**

Write `src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dAppKit } from './sui/dappKit';
import App from './App';
import './styles.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DAppKitProvider dAppKit={dAppKit}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </DAppKitProvider>
  </React.StrictMode>,
);
```

Write `src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app-shell">
      <section className="hero-strip">
        <p className="eyebrow">DeepHarbor</p>
        <h1>On-chain structured products powered by DeepBook Predict.</h1>
        <p className="lede">
          Real quotes, transparent legs, and payoff simulation for Dual Investment and Shark Fin.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Add base CSS**

Write `src/styles.css`:

```css
:root {
  color: #10201b;
  background: #f6f8f4;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(246, 248, 244, 0.94)),
    #f6f8f4;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
}

.hero-strip {
  max-width: 980px;
  margin: 0 auto;
  padding: 56px 0;
}

.eyebrow {
  margin: 0 0 12px;
  color: #146b5a;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  max-width: 760px;
  margin: 0;
  color: #0a2f2a;
  font-size: clamp(2.5rem, 6vw, 5rem);
  line-height: 0.95;
  letter-spacing: 0;
}

.lede {
  max-width: 640px;
  margin: 24px 0 0;
  color: #4d5f58;
  font-size: 1.05rem;
  line-height: 1.6;
}
```

- [ ] **Step 6: Verify app skeleton**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: `lint` and `build` pass; `test` reports no test files or exits successfully depending on Vitest version.

- [ ] **Step 7: Commit app skeleton**

Run:

```bash
git add src package.json package-lock.json
git commit -m "feat: add Sui dApp shell"
```

## Task 3: Add Product Domain Types And Unit Helpers

**Files:**
- Create: `src/products/types.ts`
- Create: `src/products/units.ts`
- Create: `src/products/strikeGrid.ts`
- Create: `src/products/strikeGrid.test.ts`

- [ ] **Step 1: Write failing strike grid tests**

Write `src/products/strikeGrid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { alignToGrid, buildStrikeLadder } from './strikeGrid';

describe('alignToGrid', () => {
  it('rounds arbitrary user prices to the nearest executable strike', () => {
    expect(alignToGrid(73188.873666, 50000, 1)).toEqual({
      input: 73188.873666,
      aligned: 73189,
      diff: 0.1263340000008461,
      diffBps: 0.01726138969087921,
    });
  });

  it('supports protocol-style integer strike units', () => {
    expect(alignToGrid(73188_873_666_000, 50_000_000_000_000, 1_000_000_000).aligned).toBe(
      73_189_000_000_000,
    );
  });
});

describe('buildStrikeLadder', () => {
  it('builds floor-inclusive target-exclusive strikes', () => {
    expect(buildStrikeLadder({ floor: 58_000, target: 73_000, step: 2_000 })).toEqual([
      58_000,
      60_000,
      62_000,
      64_000,
      66_000,
      68_000,
      70_000,
      72_000,
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/products/strikeGrid.test.ts
```

Expected: FAIL because `./strikeGrid` does not exist.

- [ ] **Step 3: Add shared product types**

Write `src/products/types.ts`:

```ts
export type ProductType = 'dual-investment' | 'shark-fin';

export type LegInstrumentType = 'binary-up' | 'range';

export interface OracleMarket {
  predictId: string;
  oracleId: string;
  underlyingAsset: 'BTC';
  expiryMs: number;
  minStrike: number;
  tickSize: number;
  status: 'created' | 'active' | 'settled' | string;
  spot: number;
  forward: number;
  spotTimestampMs: number;
  sviTimestampMs: number;
  serverLagSeconds: number;
}

export interface LegIntent {
  id: string;
  instrumentType: LegInstrumentType;
  oracleId: string;
  expiryMs: number;
  strike?: number;
  lowerStrike?: number;
  higherStrike?: number;
  isUp?: boolean;
  quantity: number;
  description: string;
}

export interface LegQuote extends LegIntent {
  askPrice: number;
  askCost: number;
  redeemPreview: number;
  quoteTimestampMs: number;
  executable: boolean;
  error?: string;
}

export interface ScenarioOutcome {
  settlementPrice: number;
  label: string;
  finalUsdc: number;
  btcEquivalent?: number;
  coupon: number;
  realizedLegIds: string[];
  expiredLegIds: string[];
}

export interface StructuredProductQuote {
  id: string;
  productType: ProductType;
  title: string;
  principal: number;
  oracle: OracleMarket;
  legs: LegQuote[];
  totalLegCost: number;
  reserve: number;
  coupon: number;
  apr: number;
  executable: boolean;
  warning?: string;
  scenarios: ScenarioOutcome[];
}

export interface DualInvestmentInput {
  principal: number;
  targetPrice: number;
  floorPrice: number;
  stepSize: number;
}

export interface SharkFinInput {
  principal: number;
  lowerBound: number;
  upperBound: number;
  stepSize: number;
  baseApr: number;
}
```

- [ ] **Step 4: Add unit conversion helpers**

Write `src/products/units.ts`:

```ts
export const PRICE_SCALE = 1_000_000_000;

export function fromChainPrice(value: number | string): number {
  return Number(value) / PRICE_SCALE;
}

export function toChainPrice(value: number): number {
  return Math.round(value * PRICE_SCALE);
}

export function daysBetween(nowMs: number, expiryMs: number): number {
  return Math.max(0, (expiryMs - nowMs) / 86_400_000);
}

export function aprFromCoupon(coupon: number, principal: number, daysToExpiry: number): number {
  if (principal <= 0 || daysToExpiry <= 0) return 0;
  return (coupon / principal) * (365 / daysToExpiry);
}
```

- [ ] **Step 5: Add strike grid implementation**

Write `src/products/strikeGrid.ts`:

```ts
export interface StrikeAlignment {
  input: number;
  aligned: number;
  diff: number;
  diffBps: number;
}

export function alignToGrid(input: number, minStrike: number, tickSize: number): StrikeAlignment {
  const ticks = Math.round((input - minStrike) / tickSize);
  const aligned = minStrike + ticks * tickSize;
  const diff = aligned - input;
  const diffBps = input === 0 ? 0 : (diff / input) * 10_000;
  return { input, aligned, diff, diffBps };
}

export function buildStrikeLadder(input: {
  floor: number;
  target: number;
  step: number;
}): number[] {
  const strikes: number[] = [];
  for (let strike = input.floor; strike < input.target; strike += input.step) {
    strikes.push(strike);
  }
  return strikes;
}
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
npm test -- src/products/strikeGrid.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit product primitives**

Run:

```bash
git add src/products/types.ts src/products/units.ts src/products/strikeGrid.ts src/products/strikeGrid.test.ts
git commit -m "feat: add product domain primitives"
```

## Task 4: Add DeepBook Predict Server Client

**Files:**
- Create: `src/deepbook/predictServer.ts`
- Create: `src/deepbook/fixtures.ts`
- Create: `src/test/fixtures/status.json`
- Create: `src/test/fixtures/oracleState.json`
- Create: `src/deepbook/predictServer.test.ts`

- [ ] **Step 1: Write failing parser tests**

Write `src/deepbook/predictServer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import statusFixture from '../test/fixtures/status.json';
import oracleFixture from '../test/fixtures/oracleState.json';
import { parseOracleState, parseStatus } from './predictServer';

describe('predictServer parsers', () => {
  it('parses server status freshness', () => {
    expect(parseStatus(statusFixture).maxCheckpointLag).toBe(5);
    expect(parseStatus(statusFixture).maxTimeLagSeconds).toBe(1);
  });

  it('parses oracle state into normalized market data', () => {
    const parsed = parseOracleState(oracleFixture, { serverLagSeconds: 1 });
    expect(parsed.oracleId).toBe('0xb46fdd7aee8b5b729358a254a74ec4eb59c2a07ca8878cc77df09b843bae6c38');
    expect(parsed.underlyingAsset).toBe('BTC');
    expect(parsed.spot).toBeCloseTo(73264.292161574);
    expect(parsed.forward).toBeCloseTo(73264.782323624);
    expect(parsed.minStrike).toBe(50000);
    expect(parsed.tickSize).toBe(1);
    expect(parsed.status).toBe('active');
  });
});
```

- [ ] **Step 2: Add server fixtures**

Write `src/test/fixtures/status.json`:

```json
{
  "status": "OK",
  "latest_onchain_checkpoint": 343397889,
  "current_time_ms": 1780293680663,
  "earliest_checkpoint": 343397884,
  "max_lag_pipeline": "trading_pause_updated",
  "max_checkpoint_lag": 5,
  "max_time_lag_seconds": 1,
  "pipelines": []
}
```

Write `src/test/fixtures/oracleState.json`:

```json
{
  "oracle": {
    "predict_id": "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
    "oracle_id": "0xb46fdd7aee8b5b729358a254a74ec4eb59c2a07ca8878cc77df09b843bae6c38",
    "underlying_asset": "BTC",
    "expiry": 1780299900000,
    "min_strike": 50000000000000,
    "tick_size": 1000000000,
    "status": "active"
  },
  "latest_price": {
    "spot": 73264292161574,
    "forward": 73264782323624,
    "onchain_timestamp": 1780293695403
  },
  "latest_svi": {
    "a": 18652,
    "b": 1284769,
    "rho": 709081279,
    "rho_negative": true,
    "m": 1889030,
    "m_negative": true,
    "sigma": 1665076,
    "onchain_timestamp": 1780293682377
  },
  "ask_bounds": null
}
```

- [ ] **Step 3: Run parser tests to verify failure**

Run:

```bash
npm test -- src/deepbook/predictServer.test.ts
```

Expected: FAIL because `./predictServer` does not exist.

- [ ] **Step 4: Add predict server client and parsers**

Write `src/deepbook/predictServer.ts`:

```ts
import { PREDICT_SERVER_URL } from '../config/deepbook';
import type { OracleMarket } from '../products/types';
import { fromChainPrice } from '../products/units';

export interface PredictStatus {
  maxCheckpointLag: number;
  maxTimeLagSeconds: number;
}

export interface PredictOracleListItem {
  predict_id: string;
  oracle_id: string;
  underlying_asset: string;
  expiry: number;
  min_strike: number;
  tick_size: number;
  status: string;
}

export function parseStatus(payload: unknown): PredictStatus {
  const data = payload as { max_checkpoint_lag?: number; max_time_lag_seconds?: number };
  return {
    maxCheckpointLag: Number(data.max_checkpoint_lag ?? 0),
    maxTimeLagSeconds: Number(data.max_time_lag_seconds ?? 0),
  };
}

export function parseOracleState(
  payload: unknown,
  input: { serverLagSeconds: number },
): OracleMarket {
  const data = payload as {
    oracle: {
      predict_id: string;
      oracle_id: string;
      underlying_asset: 'BTC';
      expiry: number;
      min_strike: number;
      tick_size: number;
      status: string;
    };
    latest_price: {
      spot: number | string;
      forward: number | string;
      onchain_timestamp: number;
    };
    latest_svi: {
      onchain_timestamp: number;
    };
  };

  return {
    predictId: data.oracle.predict_id,
    oracleId: data.oracle.oracle_id,
    underlyingAsset: data.oracle.underlying_asset,
    expiryMs: data.oracle.expiry,
    minStrike: fromChainPrice(data.oracle.min_strike),
    tickSize: fromChainPrice(data.oracle.tick_size),
    status: data.oracle.status,
    spot: fromChainPrice(data.latest_price.spot),
    forward: fromChainPrice(data.latest_price.forward),
    spotTimestampMs: data.latest_price.onchain_timestamp,
    sviTimestampMs: data.latest_svi.onchain_timestamp,
    serverLagSeconds: input.serverLagSeconds,
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${PREDICT_SERVER_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Predict server request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchPredictStatus(): Promise<PredictStatus> {
  return parseStatus(await fetchJson('/status'));
}

export async function fetchActiveBtcOracles(predictId: string): Promise<PredictOracleListItem[]> {
  const data = await fetchJson<PredictOracleListItem[]>(`/predicts/${predictId}/oracles`);
  return data.filter((oracle) => oracle.underlying_asset === 'BTC' && oracle.status === 'active');
}

export async function fetchOracleMarket(
  oracleId: string,
  input: { serverLagSeconds: number },
): Promise<OracleMarket> {
  return parseOracleState(await fetchJson(`/oracles/${oracleId}/state`), input);
}
```

Write `src/deepbook/fixtures.ts`:

```ts
import type { OracleMarket } from '../products/types';

export const lastKnownMarketSnapshot: OracleMarket = {
  predictId: '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
  oracleId: '0xb46fdd7aee8b5b729358a254a74ec4eb59c2a07ca8878cc77df09b843bae6c38',
  underlyingAsset: 'BTC',
  expiryMs: 1780299900000,
  minStrike: 50_000,
  tickSize: 1,
  status: 'active',
  spot: 73_264.292161574,
  forward: 73_264.782323624,
  spotTimestampMs: 1780293695403,
  sviTimestampMs: 1780293682377,
  serverLagSeconds: 1,
};
```

- [ ] **Step 5: Run parser tests to verify pass**

Run:

```bash
npm test -- src/deepbook/predictServer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit predict server client**

Run:

```bash
git add src/deepbook src/test/fixtures
git commit -m "feat: add DeepBook Predict market data client"
```

## Task 5: Add Quote Provider Interface And Live Preview Boundary

**Files:**
- Create: `src/deepbook/quoteProvider.ts`

- [ ] **Step 1: Add normalized quote provider**

Write `src/deepbook/quoteProvider.ts`:

```ts
import type { LegIntent, LegQuote } from '../products/types';

export interface QuoteProvider {
  quoteLegs(legs: LegIntent[]): Promise<LegQuote[]>;
}

export class SnapshotQuoteProvider implements QuoteProvider {
  async quoteLegs(legs: LegIntent[]): Promise<LegQuote[]> {
    const now = Date.now();
    return legs.map((leg) => {
      const moneyness =
        leg.strike === undefined ? 0.35 : Math.max(0.04, Math.min(0.92, 1 - leg.strike / 100_000));
      const askPrice = leg.instrumentType === 'range' ? 0.18 : moneyness;
      const askCost = askPrice * leg.quantity;
      return {
        ...leg,
        askPrice,
        askCost,
        redeemPreview: Math.max(0, askPrice - 0.02) * leg.quantity,
        quoteTimestampMs: now,
        executable: false,
        error: 'Using stale snapshot pricing until live preview is connected.',
      };
    });
  }
}

export class LivePreviewQuoteProvider implements QuoteProvider {
  constructor(private readonly fallback: QuoteProvider = new SnapshotQuoteProvider()) {}

  async quoteLegs(legs: LegIntent[]): Promise<LegQuote[]> {
    try {
      return await this.previewLegs(legs);
    } catch {
      return this.fallback.quoteLegs(legs);
    }
  }

  private async previewLegs(_legs: LegIntent[]): Promise<LegQuote[]> {
    throw new Error('Live preview adapter is not connected in this task.');
  }
}
```

This keeps compiler/UI work moving while marking fallback quotes as non-executable. The live preview implementation is a focused follow-up once the current SDK method for read-only Move calls is verified against the installed `@mysten/sui` version.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Commit quote provider boundary**

Run:

```bash
git add src/deepbook/quoteProvider.ts
git commit -m "feat: add Predict quote provider boundary"
```

## Task 6: Implement Dual Investment Compiler

**Files:**
- Create: `src/products/dualInvestment.ts`
- Create: `src/products/dualInvestment.test.ts`

- [ ] **Step 1: Write failing compiler tests**

Write `src/products/dualInvestment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compileDualInvestment } from './dualInvestment';
import { lastKnownMarketSnapshot } from '../deepbook/fixtures';

describe('compileDualInvestment', () => {
  it('builds an UP ladder and computes positive coupon from quoted legs', () => {
    const quote = compileDualInvestment({
      input: {
        principal: 1_000,
        targetPrice: 73_000,
        floorPrice: 58_000,
        stepSize: 2_000,
      },
      oracle: lastKnownMarketSnapshot,
      quotedLegs: [
        { id: 'up-58000', askCost: 3, askPrice: 0.21, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-60000', askCost: 3, askPrice: 0.2, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-62000', askCost: 3, askPrice: 0.19, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-64000', askCost: 3, askPrice: 0.18, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-66000', askCost: 3, askPrice: 0.17, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-68000', askCost: 3, askPrice: 0.16, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-70000', askCost: 3, askPrice: 0.15, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-72000', askCost: 3, askPrice: 0.14, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
      ],
    });

    expect(quote.legs).toHaveLength(8);
    expect(quote.reserve).toBeCloseTo(794.5205479452);
    expect(quote.totalLegCost).toBe(24);
    expect(quote.coupon).toBeCloseTo(181.4794520548);
    expect(quote.executable).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- src/products/dualInvestment.test.ts
```

Expected: FAIL because `./dualInvestment` does not exist.

- [ ] **Step 3: Implement Dual Investment compiler**

Write `src/products/dualInvestment.ts`:

```ts
import type { DualInvestmentInput, LegIntent, LegQuote, OracleMarket, StructuredProductQuote } from './types';
import { aprFromCoupon, daysBetween } from './units';
import { buildStrikeLadder } from './strikeGrid';
import { simulatePayoff } from './payoff';

export function buildDualInvestmentLegIntents(
  input: DualInvestmentInput,
  oracle: OracleMarket,
): LegIntent[] {
  const targetBtcAmount = input.principal / input.targetPrice;
  const quantityPerStep = targetBtcAmount * input.stepSize;
  return buildStrikeLadder({
    floor: input.floorPrice,
    target: input.targetPrice,
    step: input.stepSize,
  }).map((strike) => ({
    id: `up-${strike}`,
    instrumentType: 'binary-up',
    oracleId: oracle.oracleId,
    expiryMs: oracle.expiryMs,
    strike,
    isUp: true,
    quantity: quantityPerStep,
    description: `UP ${strike.toLocaleString('en-US')}`,
  }));
}

export function compileDualInvestment(input: {
  input: DualInvestmentInput;
  oracle: OracleMarket;
  quotedLegs: Partial<LegQuote>[];
  nowMs?: number;
}): StructuredProductQuote {
  const legIntents = buildDualInvestmentLegIntents(input.input, input.oracle);
  const legs = legIntents.map((intent, index) => ({
    ...intent,
    askPrice: input.quotedLegs[index]?.askPrice ?? 0,
    askCost: input.quotedLegs[index]?.askCost ?? 0,
    redeemPreview: input.quotedLegs[index]?.redeemPreview ?? 0,
    quoteTimestampMs: input.quotedLegs[index]?.quoteTimestampMs ?? Date.now(),
    executable: input.quotedLegs[index]?.executable ?? false,
    error: input.quotedLegs[index]?.error,
  }));
  const targetBtcAmount = input.input.principal / input.input.targetPrice;
  const reserve = targetBtcAmount * input.input.floorPrice;
  const totalLegCost = legs.reduce((sum, leg) => sum + leg.askCost, 0);
  const coupon = input.input.principal - reserve - totalLegCost;
  const days = daysBetween(input.nowMs ?? Date.now(), input.oracle.expiryMs);
  const executable = coupon > 0 && legs.every((leg) => leg.executable);
  const quote: StructuredProductQuote = {
    id: `dual-${input.oracle.oracleId}-${input.input.targetPrice}-${input.input.floorPrice}`,
    productType: 'dual-investment',
    title: `Target Buy BTC at ${input.input.targetPrice.toLocaleString('en-US')}`,
    principal: input.input.principal,
    oracle: input.oracle,
    legs,
    totalLegCost,
    reserve,
    coupon,
    apr: aprFromCoupon(coupon, input.input.principal, days),
    executable,
    warning: coupon <= 0 ? 'Current leg costs leave no positive coupon.' : undefined,
    scenarios: [],
  };
  return { ...quote, scenarios: simulatePayoff(quote) };
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/products/dualInvestment.test.ts
```

Expected: FAIL because `./payoff` is not implemented yet. Keep this known failure until Task 8.

- [ ] **Step 5: Commit Dual Investment compiler**

Run:

```bash
git add src/products/dualInvestment.ts src/products/dualInvestment.test.ts
git commit -m "feat: add Dual Investment compiler"
```

## Task 7: Implement Shark Fin Compiler

**Files:**
- Create: `src/products/sharkFin.ts`
- Create: `src/products/sharkFin.test.ts`

- [ ] **Step 1: Write failing Shark Fin tests**

Write `src/products/sharkFin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compileSharkFin } from './sharkFin';
import { lastKnownMarketSnapshot } from '../deepbook/fixtures';

describe('compileSharkFin', () => {
  it('uses yield budget to fund quoted range legs', () => {
    const quote = compileSharkFin({
      input: {
        principal: 1_000,
        lowerBound: 74_000,
        upperBound: 86_000,
        stepSize: 2_000,
        baseApr: 0.5,
      },
      oracle: { ...lastKnownMarketSnapshot, expiryMs: Date.now() + 7 * 86_400_000 },
      quotedLegs: [
        { id: 'range-74000-86000', askCost: 5, askPrice: 0.2, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
      ],
      nowMs: Date.now(),
    });

    expect(quote.productType).toBe('shark-fin');
    expect(quote.reserve).toBe(1_000);
    expect(quote.totalLegCost).toBe(5);
    expect(quote.coupon).toBeGreaterThan(0);
    expect(quote.executable).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- src/products/sharkFin.test.ts
```

Expected: FAIL because `./sharkFin` does not exist.

- [ ] **Step 3: Implement Shark Fin compiler**

Write `src/products/sharkFin.ts`:

```ts
import type { LegIntent, LegQuote, OracleMarket, SharkFinInput, StructuredProductQuote } from './types';
import { aprFromCoupon, daysBetween } from './units';
import { simulatePayoff } from './payoff';

export function buildSharkFinLegIntents(input: SharkFinInput, oracle: OracleMarket): LegIntent[] {
  return [
    {
      id: `range-${input.lowerBound}-${input.upperBound}`,
      instrumentType: 'range',
      oracleId: oracle.oracleId,
      expiryMs: oracle.expiryMs,
      lowerStrike: input.lowerBound,
      higherStrike: input.upperBound,
      quantity: input.principal * input.baseApr,
      description: `Range ${input.lowerBound.toLocaleString('en-US')} - ${input.upperBound.toLocaleString('en-US')}`,
    },
  ];
}

export function compileSharkFin(input: {
  input: SharkFinInput;
  oracle: OracleMarket;
  quotedLegs: Partial<LegQuote>[];
  nowMs?: number;
}): StructuredProductQuote {
  const legIntents = buildSharkFinLegIntents(input.input, input.oracle);
  const legs = legIntents.map((intent, index) => ({
    ...intent,
    askPrice: input.quotedLegs[index]?.askPrice ?? 0,
    askCost: input.quotedLegs[index]?.askCost ?? 0,
    redeemPreview: input.quotedLegs[index]?.redeemPreview ?? 0,
    quoteTimestampMs: input.quotedLegs[index]?.quoteTimestampMs ?? Date.now(),
    executable: input.quotedLegs[index]?.executable ?? false,
    error: input.quotedLegs[index]?.error,
  }));
  const nowMs = input.nowMs ?? Date.now();
  const days = daysBetween(nowMs, input.oracle.expiryMs);
  const yieldBudget = input.input.principal * input.input.baseApr * (days / 365);
  const totalLegCost = legs.reduce((sum, leg) => sum + leg.askCost, 0);
  const coupon = yieldBudget - totalLegCost;
  const executable = coupon >= 0 && legs.every((leg) => leg.executable);
  const quote: StructuredProductQuote = {
    id: `shark-${input.oracle.oracleId}-${input.input.lowerBound}-${input.input.upperBound}`,
    productType: 'shark-fin',
    title: `BTC Shark Fin ${input.input.lowerBound.toLocaleString('en-US')} - ${input.input.upperBound.toLocaleString('en-US')}`,
    principal: input.input.principal,
    oracle: input.oracle,
    legs,
    totalLegCost,
    reserve: input.input.principal,
    coupon,
    apr: aprFromCoupon(Math.max(0, coupon), input.input.principal, days),
    executable,
    warning: coupon < 0 ? 'Assumed yield cannot fund the quoted option package.' : undefined,
    scenarios: [],
  };
  return { ...quote, scenarios: simulatePayoff(quote) };
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/products/sharkFin.test.ts
```

Expected: FAIL because `./payoff` is not implemented yet. Keep this known failure until Task 8.

- [ ] **Step 5: Commit Shark Fin compiler**

Run:

```bash
git add src/products/sharkFin.ts src/products/sharkFin.test.ts
git commit -m "feat: add Shark Fin compiler"
```

## Task 8: Implement Payoff Simulator

**Files:**
- Create: `src/products/payoff.ts`
- Create: `src/products/payoff.test.ts`
- Modify: `src/products/dualInvestment.test.ts`
- Modify: `src/products/sharkFin.test.ts`

- [ ] **Step 1: Write payoff simulator tests**

Write `src/products/payoff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { simulatePayoff } from './payoff';
import type { StructuredProductQuote } from './types';
import { lastKnownMarketSnapshot } from '../deepbook/fixtures';

function baseQuote(): StructuredProductQuote {
  return {
    id: 'dual',
    productType: 'dual-investment',
    title: 'Target Buy BTC',
    principal: 1_000,
    oracle: lastKnownMarketSnapshot,
    reserve: 794.5205479452,
    totalLegCost: 24,
    coupon: 181.4794520548,
    apr: 0.5,
    executable: true,
    legs: [
      { id: 'up-58000', instrumentType: 'binary-up', oracleId: 'o', expiryMs: 1, strike: 58_000, isUp: true, quantity: 27.397260274, description: 'UP 58000', askPrice: 0.2, askCost: 3, redeemPreview: 0, quoteTimestampMs: 1, executable: true },
      { id: 'up-60000', instrumentType: 'binary-up', oracleId: 'o', expiryMs: 1, strike: 60_000, isUp: true, quantity: 27.397260274, description: 'UP 60000', askPrice: 0.2, askCost: 3, redeemPreview: 0, quoteTimestampMs: 1, executable: true },
    ],
    scenarios: [],
  };
}

describe('simulatePayoff', () => {
  it('marks binary UP legs as realized above their strike', () => {
    const scenarios = simulatePayoff(baseQuote(), [57_000, 59_000, 61_000]);
    expect(scenarios[0].realizedLegIds).toEqual([]);
    expect(scenarios[1].realizedLegIds).toEqual(['up-58000']);
    expect(scenarios[2].realizedLegIds).toEqual(['up-58000', 'up-60000']);
  });
});
```

- [ ] **Step 2: Run payoff tests to verify failure**

Run:

```bash
npm test -- src/products/payoff.test.ts
```

Expected: FAIL because `./payoff` does not exist.

- [ ] **Step 3: Implement payoff simulator**

Write `src/products/payoff.ts`:

```ts
import type { ScenarioOutcome, StructuredProductQuote } from './types';

function defaultSettlementPrices(quote: StructuredProductQuote): number[] {
  const spot = quote.oracle.spot;
  return [
    Math.round(spot * 0.8),
    Math.round(spot * 0.9),
    Math.round(spot),
    Math.round(spot * 1.1),
    Math.round(spot * 1.2),
  ];
}

export function simulatePayoff(
  quote: StructuredProductQuote,
  settlementPrices = defaultSettlementPrices(quote),
): ScenarioOutcome[] {
  return settlementPrices.map((settlementPrice) => {
    const realized = quote.legs.filter((leg) => {
      if (leg.instrumentType === 'binary-up') {
        return leg.strike !== undefined && settlementPrice > leg.strike;
      }
      if (leg.instrumentType === 'range') {
        return (
          leg.lowerStrike !== undefined &&
          leg.higherStrike !== undefined &&
          settlementPrice > leg.lowerStrike &&
          settlementPrice <= leg.higherStrike
        );
      }
      return false;
    });

    const payout = realized.reduce((sum, leg) => sum + leg.quantity, 0);
    const finalUsdc =
      quote.productType === 'dual-investment'
        ? quote.reserve + quote.coupon + payout
        : quote.reserve + Math.max(0, quote.coupon) + payout;

    return {
      settlementPrice,
      label: `${settlementPrice.toLocaleString('en-US')} BTC`,
      finalUsdc,
      btcEquivalent: quote.productType === 'dual-investment' ? finalUsdc / settlementPrice : undefined,
      coupon: quote.coupon,
      realizedLegIds: realized.map((leg) => leg.id),
      expiredLegIds: quote.legs.filter((leg) => !realized.includes(leg)).map((leg) => leg.id),
    };
  });
}
```

- [ ] **Step 4: Run all product tests**

Run:

```bash
npm test -- src/products
```

Expected: PASS.

- [ ] **Step 5: Commit payoff simulator**

Run:

```bash
git add src/products/payoff.ts src/products/payoff.test.ts src/products/dualInvestment.test.ts src/products/sharkFin.test.ts
git commit -m "feat: add payoff simulator"
```

## Task 9: Add Market And Quote Hooks

**Files:**
- Create: `src/hooks/useMarketData.ts`
- Create: `src/hooks/useStructuredQuote.ts`

- [ ] **Step 1: Add market data hook**

Write `src/hooks/useMarketData.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { DEEPBOOK_PREDICT } from '../config/deepbook';
import { lastKnownMarketSnapshot } from '../deepbook/fixtures';
import { fetchActiveBtcOracles, fetchOracleMarket, fetchPredictStatus } from '../deepbook/predictServer';

export function useMarketData() {
  return useQuery({
    queryKey: ['deepbook-market'],
    queryFn: async () => {
      const status = await fetchPredictStatus();
      const oracles = await fetchActiveBtcOracles(DEEPBOOK_PREDICT.predictObjectId);
      const selected = oracles.sort((a, b) => a.expiry - b.expiry)[0];
      if (!selected) {
        return { market: lastKnownMarketSnapshot, staleSnapshot: true };
      }
      const market = await fetchOracleMarket(selected.oracle_id, {
        serverLagSeconds: status.maxTimeLagSeconds,
      });
      return { market, staleSnapshot: false };
    },
    refetchInterval: 15_000,
    retry: 1,
  });
}
```

- [ ] **Step 2: Add structured quote hook**

Write `src/hooks/useStructuredQuote.ts`:

```ts
import { useMemo } from 'react';
import { LivePreviewQuoteProvider, SnapshotQuoteProvider } from '../deepbook/quoteProvider';
import { compileDualInvestment, buildDualInvestmentLegIntents } from '../products/dualInvestment';
import { compileSharkFin, buildSharkFinLegIntents } from '../products/sharkFin';
import type { DualInvestmentInput, OracleMarket, ProductType, SharkFinInput } from '../products/types';

const quoteProvider = new LivePreviewQuoteProvider(new SnapshotQuoteProvider());

export interface StructuredQuoteState {
  productType: ProductType;
  dualInput: DualInvestmentInput;
  sharkInput: SharkFinInput;
}

export async function buildStructuredQuote(input: {
  state: StructuredQuoteState;
  oracle: OracleMarket;
}) {
  if (input.state.productType === 'dual-investment') {
    const intents = buildDualInvestmentLegIntents(input.state.dualInput, input.oracle);
    const quotedLegs = await quoteProvider.quoteLegs(intents);
    return compileDualInvestment({ input: input.state.dualInput, oracle: input.oracle, quotedLegs });
  }

  const intents = buildSharkFinLegIntents(input.state.sharkInput, input.oracle);
  const quotedLegs = await quoteProvider.quoteLegs(intents);
  return compileSharkFin({ input: input.state.sharkInput, oracle: input.oracle, quotedLegs });
}

export function useDefaultStructuredQuoteState(spot: number): StructuredQuoteState {
  return useMemo(
    () => ({
      productType: 'dual-investment',
      dualInput: {
        principal: 1_000,
        targetPrice: Math.round(spot * 0.92),
        floorPrice: Math.round(spot * 0.8),
        stepSize: 1_000,
      },
      sharkInput: {
        principal: 1_000,
        lowerBound: Math.round(spot * 0.96),
        upperBound: Math.round(spot * 1.12),
        stepSize: 1_000,
        baseApr: 0.05,
      },
    }),
    [spot],
  );
}
```

- [ ] **Step 3: Typecheck hooks**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit hooks**

Run:

```bash
git add src/hooks
git commit -m "feat: add structured quote hooks"
```

## Task 10: Build The Workbench UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/ProductBuilder.tsx`
- Create: `src/components/PresetQuoteBoard.tsx`
- Create: `src/components/QuoteSummary.tsx`
- Create: `src/components/PayoffChart.tsx`
- Create: `src/components/TransparencyPanel.tsx`
- Create: `src/components/ScenarioCards.tsx`

- [ ] **Step 1: Add UI components**

Write `src/components/QuoteSummary.tsx`:

```tsx
import type { StructuredProductQuote } from '../products/types';

export function QuoteSummary({ quote }: { quote: StructuredProductQuote | null }) {
  if (!quote) return <section className="panel">Loading quote...</section>;
  return (
    <section className="panel quote-summary">
      <div>
        <p className="label">Estimated APR</p>
        <strong>{(quote.apr * 100).toFixed(2)}%</strong>
      </div>
      <div>
        <p className="label">Coupon / unused yield</p>
        <strong>{quote.coupon.toFixed(2)} dUSDC</strong>
      </div>
      <div>
        <p className="label">Leg cost</p>
        <strong>{quote.totalLegCost.toFixed(2)} dUSDC</strong>
      </div>
      <div className={quote.executable ? 'status good' : 'status warn'}>
        {quote.executable ? 'Executable quote' : 'Preview quote'}
      </div>
      {quote.warning && <p className="warning">{quote.warning}</p>}
    </section>
  );
}
```

Write `src/components/ScenarioCards.tsx`:

```tsx
import type { StructuredProductQuote } from '../products/types';

export function ScenarioCards({ quote }: { quote: StructuredProductQuote | null }) {
  if (!quote) return null;
  return (
    <section className="scenario-grid">
      {quote.scenarios.slice(0, 3).map((scenario) => (
        <article className="panel scenario" key={scenario.settlementPrice}>
          <p className="label">{scenario.label}</p>
          <strong>{scenario.finalUsdc.toFixed(2)} dUSDC</strong>
          {scenario.btcEquivalent !== undefined && <span>{scenario.btcEquivalent.toFixed(6)} BTC equivalent</span>}
          <small>{scenario.realizedLegIds.length} legs pay out</small>
        </article>
      ))}
    </section>
  );
}
```

Write `src/components/PayoffChart.tsx`:

```tsx
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StructuredProductQuote } from '../products/types';

export function PayoffChart({ quote }: { quote: StructuredProductQuote | null }) {
  if (!quote) return <section className="panel chart-panel">Loading payoff...</section>;
  return (
    <section className="panel chart-panel">
      <div className="section-title">
        <h2>Payoff</h2>
        <span>Settlement simulation</span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={quote.scenarios}>
          <XAxis dataKey="settlementPrice" tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="finalUsdc" stroke="#0f766e" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
```

Write `src/components/TransparencyPanel.tsx`:

```tsx
import type { StructuredProductQuote } from '../products/types';

export function TransparencyPanel({ quote }: { quote: StructuredProductQuote | null }) {
  if (!quote) return <aside className="panel transparency">Loading DeepBook data...</aside>;
  return (
    <aside className="panel transparency">
      <div className="section-title">
        <h2>Predict Legs</h2>
        <span>DeepBook transparency</span>
      </div>
      <dl className="oracle-meta">
        <div><dt>Oracle</dt><dd>{quote.oracle.oracleId.slice(0, 10)}...</dd></div>
        <div><dt>Spot</dt><dd>{quote.oracle.spot.toLocaleString('en-US')}</dd></div>
        <div><dt>Forward</dt><dd>{quote.oracle.forward.toLocaleString('en-US')}</dd></div>
        <div><dt>Server lag</dt><dd>{quote.oracle.serverLagSeconds}s</dd></div>
      </dl>
      <div className="leg-list">
        {quote.legs.map((leg) => (
          <div className="leg-row" key={leg.id}>
            <div>
              <strong>{leg.description}</strong>
              <span>{leg.instrumentType}</span>
            </div>
            <div>
              <strong>{leg.askCost.toFixed(4)}</strong>
              <span>dUSDC</span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

Write `src/components/PresetQuoteBoard.tsx`:

```tsx
export function PresetQuoteBoard({ spot, onSelectTarget }: { spot: number; onSelectTarget: (target: number) => void }) {
  const presets = [0.95, 0.92, 0.9, 0.88].map((ratio) => Math.round(spot * ratio));
  return (
    <div className="preset-board">
      {presets.map((target) => (
        <button type="button" key={target} onClick={() => onSelectTarget(target)}>
          <span>Target</span>
          <strong>{target.toLocaleString('en-US')}</strong>
        </button>
      ))}
    </div>
  );
}
```

Write `src/components/ProductBuilder.tsx`:

```tsx
import type { ProductType } from '../products/types';
import type { StructuredQuoteState } from '../hooks/useStructuredQuote';
import { PresetQuoteBoard } from './PresetQuoteBoard';

export function ProductBuilder({
  state,
  spot,
  onChange,
}: {
  state: StructuredQuoteState;
  spot: number;
  onChange: (state: StructuredQuoteState) => void;
}) {
  const setProduct = (productType: ProductType) => onChange({ ...state, productType });
  const setDual = (patch: Partial<typeof state.dualInput>) =>
    onChange({ ...state, dualInput: { ...state.dualInput, ...patch } });

  return (
    <section className="panel builder">
      <div className="segmented">
        <button className={state.productType === 'dual-investment' ? 'active' : ''} onClick={() => setProduct('dual-investment')} type="button">
          Dual Investment
        </button>
        <button className={state.productType === 'shark-fin' ? 'active' : ''} onClick={() => setProduct('shark-fin')} type="button">
          Shark Fin
        </button>
      </div>
      <PresetQuoteBoard spot={spot} onSelectTarget={(targetPrice) => setDual({ targetPrice })} />
      <label>
        Principal
        <input value={state.dualInput.principal} onChange={(event) => setDual({ principal: Number(event.target.value) })} />
      </label>
      <label>
        Target
        <input value={state.dualInput.targetPrice} onChange={(event) => setDual({ targetPrice: Number(event.target.value) })} />
      </label>
      <label>
        Floor
        <input value={state.dualInput.floorPrice} onChange={(event) => setDual({ floorPrice: Number(event.target.value) })} />
      </label>
      <label>
        Step
        <input value={state.dualInput.stepSize} onChange={(event) => setDual({ stepSize: Number(event.target.value) })} />
      </label>
    </section>
  );
}
```

Write `src/components/AppShell.tsx` after wiring state in the next step.

- [ ] **Step 2: Wire AppShell**

Write `src/components/AppShell.tsx`:

```tsx
import { ConnectButton } from '@mysten/dapp-kit-react';
import { useEffect, useState } from 'react';
import { useMarketData } from '../hooks/useMarketData';
import { buildStructuredQuote, useDefaultStructuredQuoteState, type StructuredQuoteState } from '../hooks/useStructuredQuote';
import type { StructuredProductQuote } from '../products/types';
import { ProductBuilder } from './ProductBuilder';
import { QuoteSummary } from './QuoteSummary';
import { PayoffChart } from './PayoffChart';
import { ScenarioCards } from './ScenarioCards';
import { TransparencyPanel } from './TransparencyPanel';

export function AppShell() {
  const marketQuery = useMarketData();
  const market = marketQuery.data?.market;
  const defaults = useDefaultStructuredQuoteState(market?.spot ?? 73_000);
  const [state, setState] = useState<StructuredQuoteState>(defaults);
  const [quote, setQuote] = useState<StructuredProductQuote | null>(null);

  useEffect(() => setState(defaults), [defaults]);

  useEffect(() => {
    if (!market) return;
    let cancelled = false;
    buildStructuredQuote({ state, oracle: market }).then((nextQuote) => {
      if (!cancelled) setQuote(nextQuote);
    });
    return () => {
      cancelled = true;
    };
  }, [market, state]);

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">DeepHarbor</p>
          <h1>On-chain structured products powered by DeepBook Predict.</h1>
        </div>
        <ConnectButton />
      </header>
      {marketQuery.data?.staleSnapshot && <div className="snapshot-banner">Showing stale snapshot because live market data is unavailable.</div>}
      <div className="grid">
        <ProductBuilder state={state} spot={market?.spot ?? 73_000} onChange={setState} />
        <div className="middle-stack">
          <QuoteSummary quote={quote} />
          <ScenarioCards quote={quote} />
          <PayoffChart quote={quote} />
        </div>
        <TransparencyPanel quote={quote} />
      </div>
    </main>
  );
}
```

Write `src/App.tsx`:

```tsx
import { AppShell } from './components/AppShell';

export default function App() {
  return <AppShell />;
}
```

- [ ] **Step 3: Replace CSS with workbench layout**

Append these rules to `src/styles.css`:

```css
.workspace {
  min-height: 100vh;
  padding: 24px;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  max-width: 1480px;
  margin: 0 auto 24px;
}

.topbar h1 {
  max-width: 760px;
  font-size: clamp(2rem, 4vw, 4.5rem);
}

.grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(360px, 1fr) minmax(280px, 420px);
  gap: 16px;
  max-width: 1480px;
  margin: 0 auto;
  align-items: start;
}

.panel {
  border: 1px solid rgba(20, 107, 90, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 20px 60px rgba(16, 32, 27, 0.06);
  padding: 18px;
}

.builder,
.middle-stack,
.transparency {
  display: grid;
  gap: 14px;
}

.segmented,
.preset-board,
.scenario-grid {
  display: grid;
  gap: 8px;
}

.segmented {
  grid-template-columns: 1fr 1fr;
}

.segmented button,
.preset-board button {
  border: 1px solid rgba(20, 107, 90, 0.18);
  border-radius: 8px;
  background: #f8fbf9;
  color: #12342d;
  min-height: 44px;
  cursor: pointer;
}

.segmented button.active {
  background: #0f766e;
  color: white;
}

label {
  display: grid;
  gap: 6px;
  color: #50645d;
  font-size: 0.86rem;
  font-weight: 700;
}

input {
  width: 100%;
  border: 1px solid rgba(20, 107, 90, 0.2);
  border-radius: 8px;
  padding: 10px 12px;
  color: #10201b;
  background: white;
}

.quote-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.label {
  margin: 0 0 6px;
  color: #667a73;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.status {
  border-radius: 8px;
  padding: 12px;
  font-weight: 800;
}

.status.good {
  background: #dcfce7;
  color: #166534;
}

.status.warn,
.warning,
.snapshot-banner {
  background: #fef3c7;
  color: #92400e;
}

.warning,
.snapshot-banner {
  border-radius: 8px;
  padding: 10px 12px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.section-title h2 {
  margin: 0;
  color: #12342d;
  font-size: 1.05rem;
}

.section-title span {
  color: #667a73;
  font-size: 0.82rem;
}

.oracle-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 14px 0;
}

.oracle-meta div,
.leg-row {
  border: 1px solid rgba(20, 107, 90, 0.12);
  border-radius: 8px;
  padding: 10px;
  background: #fbfdfb;
}

.oracle-meta dt,
.leg-row span {
  color: #667a73;
  font-size: 0.75rem;
}

.oracle-meta dd {
  margin: 4px 0 0;
  font-weight: 800;
}

.leg-list {
  display: grid;
  gap: 8px;
}

.leg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 1040px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .quote-summary {
    grid-template-columns: 1fr 1fr;
  }
}
```

- [ ] **Step 4: Verify workbench**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: PASS for all commands.

- [ ] **Step 5: Commit workbench UI**

Run:

```bash
git add src
git commit -m "feat: build DeepHarbor structured product workbench"
```

## Task 11: Add Browser Smoke Test And Visual Verification

**Files:**
- Create: `tests/deepharbor.spec.ts`

- [ ] **Step 1: Add Playwright smoke test**

Write `tests/deepharbor.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('renders DeepHarbor workbench', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('DeepHarbor')).toBeVisible();
  await expect(page.getByText('Dual Investment')).toBeVisible();
  await expect(page.getByText('Shark Fin')).toBeVisible();
  await expect(page.getByText('Predict Legs')).toBeVisible({ timeout: 20_000 });
});
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

Expected: all commands pass.

- [ ] **Step 3: Start local dev server**

Run:

```bash
npm run dev -- --port 5173
```

Expected: Vite prints a local URL at `http://127.0.0.1:5173/`. Keep this session running only while manually testing.

- [ ] **Step 4: Inspect the UI in browser**

Open `http://127.0.0.1:5173/` and verify:

- The first viewport is the structured product workbench, not a landing page.
- The left builder, middle payoff area, and right transparency panel are visible on desktop.
- On mobile, the three panels stack without text overlap.
- The quote summary does not claim guaranteed APR.
- Stale snapshot quotes are clearly marked as preview-only.

- [ ] **Step 5: Commit smoke test**

Run:

```bash
git add tests/deepharbor.spec.ts
git commit -m "test: add DeepHarbor workbench smoke test"
```

## Task 12: Replace Snapshot Quote With Verified Live Preview

**Files:**
- Modify: `src/deepbook/quoteProvider.ts`
- Create: `src/deepbook/quoteProvider.test.ts`

- [ ] **Step 1: Inspect installed SDK surface**

Run:

```bash
node -e "import('@mysten/sui/jsonRpc').then((m)=>console.log(m.SuiJsonRpcClient ? 'jsonRpc ok' : 'jsonRpc missing'))"
node -e "import('@mysten/sui/transactions').then((m)=>console.log(m.Transaction ? 'transactions ok' : 'transactions missing'))"
```

Expected:

```text
jsonRpc ok
transactions ok
```

- [ ] **Step 2: Write failing quote normalization test**

Write `src/deepbook/quoteProvider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizePreviewResult } from './quoteProvider';

describe('normalizePreviewResult', () => {
  it('normalizes mint cost and redeem payout', () => {
    expect(normalizePreviewResult({ mintCost: '12', redeemPayout: '9' })).toEqual({
      askCost: 12,
      redeemPreview: 9,
    });
  });
});
```

- [ ] **Step 3: Implement the verified preview client**

Replace `src/deepbook/quoteProvider.ts` with:

```ts
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { DEEPBOOK_PREDICT } from '../config/deepbook';
import { toChainPrice } from '../products/units';
import type { LegIntent, LegQuote } from '../products/types';

const DEV_INSPECT_SENDER =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

export interface QuoteProvider {
  quoteLegs(legs: LegIntent[]): Promise<LegQuote[]>;
}

export function normalizePreviewResult(input: { mintCost: string | number; redeemPayout: string | number }) {
  return {
    askCost: Number(input.mintCost),
    redeemPreview: Number(input.redeemPayout),
  };
}

function readU64Le(bytes: number[]): number {
  const view = new DataView(Uint8Array.from(bytes).buffer);
  return Number(view.getBigUint64(0, true));
}

function parseDevInspectAmounts(result: unknown): { mintCost: number; redeemPayout: number } {
  const data = result as {
    error?: string | null;
    results?: Array<{ returnValues?: [number[], string][] }>;
  };
  if (data.error) {
    throw new Error(data.error);
  }
  const returnValues = data.results?.at(-1)?.returnValues;
  if (!returnValues || returnValues.length < 2) {
    throw new Error('DevInspect did not return mint/redeem amounts.');
  }
  return {
    mintCost: readU64Le(returnValues[0][0]),
    redeemPayout: readU64Le(returnValues[1][0]),
  };
}

export class SnapshotQuoteProvider implements QuoteProvider {
  async quoteLegs(legs: LegIntent[]): Promise<LegQuote[]> {
    const now = Date.now();
    return legs.map((leg) => {
      const moneyness =
        leg.strike === undefined ? 0.35 : Math.max(0.04, Math.min(0.92, 1 - leg.strike / 100_000));
      const askPrice = leg.instrumentType === 'range' ? 0.18 : moneyness;
      const askCost = askPrice * leg.quantity;
      return {
        ...leg,
        askPrice,
        askCost,
        redeemPreview: Math.max(0, askPrice - 0.02) * leg.quantity,
        quoteTimestampMs: now,
        executable: false,
        error: 'Using stale snapshot pricing until live preview succeeds.',
      };
    });
  }
}

export class LivePreviewQuoteProvider implements QuoteProvider {
  private readonly client = new SuiJsonRpcClient({
    network: 'testnet',
    url: getJsonRpcFullnodeUrl('testnet'),
  });

  constructor(private readonly fallback: QuoteProvider = new SnapshotQuoteProvider()) {}

  async quoteLegs(legs: LegIntent[]): Promise<LegQuote[]> {
    const quoted = await Promise.all(
      legs.map(async (leg) => {
        try {
          return await this.previewLeg(leg);
        } catch (error) {
          const [fallback] = await this.fallback.quoteLegs([leg]);
          return {
            ...fallback,
            error: error instanceof Error ? error.message : fallback.error,
          };
        }
      }),
    );
    return quoted;
  }

  private async previewLeg(leg: LegIntent): Promise<LegQuote> {
    const tx = new Transaction();
    const key = this.buildKey(tx, leg);
    tx.moveCall({
      target:
        leg.instrumentType === 'range'
          ? `${DEEPBOOK_PREDICT.packageId}::predict::get_range_trade_amounts`
          : `${DEEPBOOK_PREDICT.packageId}::predict::get_trade_amounts`,
      arguments: [
        tx.object(DEEPBOOK_PREDICT.predictObjectId),
        tx.object(leg.oracleId),
        key,
        tx.pure.u64(Math.max(1, Math.round(leg.quantity))),
        tx.object.clock(),
      ],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: DEV_INSPECT_SENDER,
      transactionBlock: tx,
    });
    const amounts = normalizePreviewResult(parseDevInspectAmounts(result));
    return {
      ...leg,
      askPrice: leg.quantity === 0 ? 0 : amounts.askCost / leg.quantity,
      askCost: amounts.askCost,
      redeemPreview: amounts.redeemPreview,
      quoteTimestampMs: Date.now(),
      executable: true,
    };
  }

  private buildKey(tx: Transaction, leg: LegIntent) {
    if (leg.instrumentType === 'range') {
      if (leg.lowerStrike === undefined || leg.higherStrike === undefined) {
        throw new Error('Range leg requires lower and higher strikes.');
      }
      return tx.moveCall({
        target: `${DEEPBOOK_PREDICT.packageId}::range_key::new`,
        arguments: [
          tx.pure.id(leg.oracleId),
          tx.pure.u64(leg.expiryMs),
          tx.pure.u64(toChainPrice(leg.lowerStrike)),
          tx.pure.u64(toChainPrice(leg.higherStrike)),
        ],
      });
    }
    if (leg.strike === undefined) {
      throw new Error('Binary leg requires strike.');
    }
    return tx.moveCall({
      target: `${DEEPBOOK_PREDICT.packageId}::market_key::new`,
      arguments: [
        tx.pure.id(leg.oracleId),
        tx.pure.u64(leg.expiryMs),
        tx.pure.u64(toChainPrice(leg.strike)),
        tx.pure.bool(leg.isUp ?? true),
      ],
    });
  }
}
```

This implementation uses `SuiJsonRpcClient.devInspectTransactionBlock` because `@mysten/sui@2.17.0` exposes devInspect there. It still falls back per leg if preview fails, but fallback legs remain `executable: false`.

The preview calls these Move functions:

```text
market_key::new(oracle_id, expiry, strike, true)
predict::get_trade_amounts(predict, oracle, key, quantity, clock)
range_key::new(oracle_id, expiry, lower_strike, higher_strike)
predict::get_range_trade_amounts(predict, oracle, key, quantity, clock)
```

The implementation uses `tx.pure.u64`, `tx.pure.bool`, `tx.pure.id`, and `tx.object.clock()`. It does not hardcode object versions.

Keep `normalizePreviewResult` exactly as:

```ts
export function normalizePreviewResult(input: { mintCost: string | number; redeemPayout: string | number }) {
  return {
    askCost: Number(input.mintCost),
    redeemPreview: Number(input.redeemPayout),
  };
}
```

- [ ] **Step 4: Run quote provider tests and full checks**

Run:

```bash
npm test -- src/deepbook/quoteProvider.test.ts
npm run lint
npm test
npm run build
```

Expected: PASS. If a live leg preview reverts because of oracle status, strike grid, or protocol risk limits, that individual leg falls back to non-executable snapshot pricing and displays the revert message.

- [ ] **Step 5: Commit live preview work**

Run:

```bash
git add src/deepbook/quoteProvider.ts src/deepbook/quoteProvider.test.ts
git commit -m "feat: add live Predict quote preview"
```

## Self-Review Notes

- Spec coverage:
  - Real market data: Task 4 and Task 9.
  - Real quote adapter boundary: Task 5 and Task 12.
  - Dual Investment compiler: Task 6.
  - Shark Fin compiler: Task 7.
  - Payoff simulation: Task 8.
  - Workbench UI and transparency panel: Task 10.
  - Browser smoke test: Task 11.
  - Sui dApp Kit setup: Task 2.
- Scope: The plan builds V1 frontend and keeps Move contracts, fee capture, tokenized receipts, and auto-roll outside implementation.
- Type consistency: Product types flow from `LegIntent` to `LegQuote` to `StructuredProductQuote`; compilers and UI consume the same names.
