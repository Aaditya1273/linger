/**
 * Task 2 proof: place one real IOC order on Somnia Shannon and watch a market settle.
 *
 * Run:  cp .env.example .env && $EDITOR .env   # set BURNER_PRIVATE_KEY
 *       npm run smoke
 *
 * Needs STT for gas — fund the burner at https://testnet.somnia.network.
 * tUSDC is self-funded here through the SDK's testnet faucet.
 *
 * This script is the only place in the repo that holds a signer outside the
 * browser. It is testnet-only by construction: `somniaShannon` is the sole
 * chain the dex package builds, and there is no mainnet config anywhere.
 */

import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import {
  bestAsk,
  configFromEnv,
  createDex,
  formatRaw,
  gateForWrite,
  groupByExpiry,
  listBinaryMarkets,
  parseRaw,
  scaleFor,
  scanSettled,
  upSymbol,
  buyUpIOC,
  type AnkerBinaryMarket,
} from "@anker/dex";

/**
 * Env loader: `.env.local` first (Next's own convention, and where a key
 * actually belongs), then `.env`. First file to define a name wins.
 */
function loadEnv(paths = [".env.local", ".env"]): void {
  for (const path of paths) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m?.[1] && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2]?.replace(/^["']|["']$/g, "") ?? "";
      }
    }
  }
}

/** Accepts BURNER_PRIVATE_KEY or the plainer PRIVATE_KEY, with or without 0x. */
function burnerKey(): `0x${string}` | undefined {
  const raw = (process.env.BURNER_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "").trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) return undefined;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

const log = (...args: unknown[]) => console.log(...args);

function fail(msg: string): never {
  console.error(`\n  FAIL  ${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnv();
  const key = burnerKey();
  if (!key) {
    fail(
      "No burner key found. Set PRIVATE_KEY (or BURNER_PRIVATE_KEY) to a 64-hex-char " +
        "key in .env.local — see .env.example.",
    );
  }
  process.env.BURNER_PRIVATE_KEY = key;

  const config = configFromEnv();
  if (!config.privateKey) fail("Burner key did not parse.");
  const dex = createDex(config);
  const account = privateKeyToAccount(config.privateKey);
  log(`\n▸ signer      ${account.address}`);
  log(`▸ chain       Somnia Shannon (50312)`);

  const gas = await dex.read.getBalance({ address: account.address });
  log(`▸ STT balance ${formatRaw(gas, { decimals: 18, one: 10n ** 18n })} STT`);
  if (gas === 0n) {
    fail("Burner has 0 STT and cannot pay gas. Fund it at https://testnet.somnia.network then re-run.");
  }

  // --- 1. fund tUSDC FIRST ------------------------------------------------
  // Order matters on a venue whose markets live ~60s: a faucet tx between
  // choosing a market and sending the order can eat most of that market's
  // remaining life, and the order then lands after it locks.
  try {
    const faucet = await dex.exchange.trader.faucet();
    log(`\n▸ faucet tx   ${faucet.hash}`);
  } catch (error) {
    log(`\n▸ faucet      skipped (${error instanceof Error ? error.message : "unavailable"})`);
  }

  // --- 2. discover live markets -------------------------------------------
  const markets = await listBinaryMarkets(dex, { force: true });
  log(`\n▸ live binary markets: ${markets.length}`);
  if (markets.length === 0) fail("Indexer returned no binary markets.");

  const byExpiry = groupByExpiry(markets, "BTC");
  log(`▸ BTC fixed-strike expiries: ${byExpiry.size}`);
  for (const [expiry, ms] of [...byExpiry.entries()].slice(-3)) {
    const dt = expiry - Math.floor(Date.now() / 1000);
    log(`    ${new Date(expiry * 1000).toISOString()}  strikes=${ms.length}  t${dt >= 0 ? "+" : ""}${dt}s`);
  }

  // --- 3. pick a market with real runway, live on-chain, with a resting ask
  // MIN_RUNWAY_SEC: the order needs time to be signed, sent and mined before
  // the market locks. Anything tighter is a coin flip against the clock.
  const MIN_RUNWAY_SEC = 20;
  let chosen: AnkerBinaryMarket | undefined;
  let askRaw = 0n;
  const candidates = markets
    .filter((m) => m.expirySec - Math.floor(Date.now() / 1000) >= MIN_RUNWAY_SEC)
    .sort((a, b) => b.expirySec - a.expirySec);

  for (const market of candidates) {
    const gate = await gateForWrite(dex, market);
    if (!gate.ok) continue;
    const ask = await bestAsk(dex, market);
    if (ask.kind === "no-liquidity") continue;
    chosen = market;
    askRaw = ask.priceRaw;
    break;
  }
  if (!chosen) {
    fail(
      "No market is simultaneously Trading on-chain and has a resting ask. " +
        "Shannon markets live ~60s, so this is timing, not a code fault — re-run.",
    );
  }
  const market = chosen;

  const scale = await scaleFor(dex, market);
  log(`\n▸ market      ${upSymbol(market)}`);
  log(`▸ expiry      ${new Date(market.expirySec * 1000).toISOString()}`);
  log(`▸ collateral  ${market.collateral} (${scale.decimals} decimals)`);
  log(`▸ best ask    ${formatRaw(askRaw, scale)}`);

  // --- 4. place ONE real IOC order ----------------------------------------
  // Generous cross buffer. With IOC the limit is only a BOUND: the fill happens
  // at the resting maker's price, so bidding well above the ask does not cost
  // more — it just stops a tick of drift between the book read and the mine
  // from turning into ImmediateOrCancelNoFill.
  const CROSS_BUFFER_BPS = 2_000;
  const qtyRaw = parseRaw("1", scale); // 1 whole outcome token
  log(`\n▸ runway      ${market.expirySec - Math.floor(Date.now() / 1000)}s`);
  log(`▸ placing IOC BUY_YES qty=${formatRaw(qtyRaw, scale)} (limit = ask + ${CROSS_BUFFER_BPS / 100} pts) …`);
  const fill = await buyUpIOC(dex, market, qtyRaw, { bufferBps: CROSS_BUFFER_BPS });

  log(`\n  outcome        ${fill.outcome}`);
  log(`  transactionHash ${fill.transactionHash ?? "(none)"}`);
  log(`  filled          ${formatRaw(fill.filledRaw, scale)}`);
  log(`  avg price       ${formatRaw(fill.avgPriceRaw, scale)}`);
  if (fill.reason) log(`  reason          ${fill.reason}`);
  if (fill.transactionHash) {
    log(`  explorer        https://shannon-explorer.somnia.network/tx/${fill.transactionHash}`);
  }

  // --- 5. detect settlement ------------------------------------------------
  log(`\n▸ scanning recently settled markets (the respawn mechanic) …`);
  const settled = await scanSettled(dex, { limit: 50 });
  log(`  settled markets found: ${settled.length}`);
  for (const s of settled.slice(0, 5)) {
    log(`    ${s.symbol}  outcome=${s.outcome}  yesWon=${s.yesWon ?? "—"}`);
  }
  const ours = settled.find((s) => s.marketId === market.marketId);
  log(ours ? `  our market settled: ${ours.outcome}` : `  our market has not settled yet (expected — it is still live)`);

  log(`\n  DONE\n`);
  process.exit(0);
}

main().catch((error) => fail(error instanceof Error ? error.stack ?? error.message : String(error)));
