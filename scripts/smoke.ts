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

// Minimal .env loader — avoids a dependency for six lines of parsing.
function loadEnv(path = ".env"): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (key && process.env[key] === undefined) {
      process.env[key] = value?.replace(/^["']|["']$/g, "") ?? "";
    }
  }
}

const log = (...args: unknown[]) => console.log(...args);

function fail(msg: string): never {
  console.error(`\n  FAIL  ${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.BURNER_PRIVATE_KEY?.trim()) {
    fail("BURNER_PRIVATE_KEY is not set. Copy .env.example to .env and add a funded burner key.");
  }

  const config = configFromEnv();
  if (!config.privateKey) fail("BURNER_PRIVATE_KEY did not parse as a 0x-prefixed key.");
  const dex = createDex(config);
  const account = privateKeyToAccount(config.privateKey);
  log(`\n▸ signer      ${account.address}`);
  log(`▸ chain       Somnia Shannon (50312)`);

  const gas = await dex.read.getBalance({ address: account.address });
  log(`▸ STT balance ${formatRaw(gas, { decimals: 18, one: 10n ** 18n })} STT`);
  if (gas === 0n) {
    fail("Burner has 0 STT and cannot pay gas. Fund it at https://testnet.somnia.network then re-run.");
  }

  // --- 1. discover live markets -------------------------------------------
  const markets = await listBinaryMarkets(dex, { force: true });
  log(`\n▸ live binary markets: ${markets.length}`);
  if (markets.length === 0) fail("Indexer returned no binary markets.");

  const byExpiry = groupByExpiry(markets, "BTC");
  log(`▸ BTC fixed-strike expiries: ${byExpiry.size}`);
  for (const [expiry, ms] of [...byExpiry.entries()].slice(-3)) {
    const dt = expiry - Math.floor(Date.now() / 1000);
    log(`    ${new Date(expiry * 1000).toISOString()}  strikes=${ms.length}  t${dt >= 0 ? "+" : ""}${dt}s`);
  }

  // --- 2. pick a market that is live on-chain AND has a resting ask --------
  let chosen: AnkerBinaryMarket | undefined;
  let askRaw = 0n;
  for (const market of markets) {
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

  // --- 3. fund tUSDC via the SDK faucet -----------------------------------
  try {
    const faucet = await dex.exchange.trader.faucet();
    log(`\n▸ faucet tx   ${faucet.hash}`);
  } catch (error) {
    log(`▸ faucet      skipped (${error instanceof Error ? error.message : "unavailable"})`);
  }

  // --- 4. place ONE real IOC order ----------------------------------------
  const qtyRaw = parseRaw("1", scale); // 1 whole outcome token
  log(`\n▸ placing IOC BUY_YES qty=${formatRaw(qtyRaw, scale)} …`);
  const fill = await buyUpIOC(dex, market, qtyRaw);

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
