/**
 * Deploy AnkerNote to Somnia Shannon and record the address.
 *
 *   npm run contract:build && npm run contract:deploy
 *
 * Needs a burner with STT for gas (https://testnet.somnia.network).
 * Testnet only — `somniaShannon` is the sole chain this repo builds against.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";

function loadEnv(path = ".env"): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]?.replace(/^["']|["']$/g, "") ?? "";
  }
}

function fail(msg: string): never {
  console.error(`\n  FAIL  ${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadEnv();
  const key = process.env.BURNER_PRIVATE_KEY?.trim();
  if (!key) fail("BURNER_PRIVATE_KEY is not set (see .env.example).");

  const artifact = JSON.parse(readFileSync("contracts/build/AnkerNote.json", "utf8")) as {
    abi: unknown[];
    bytecode: Hex;
  };

  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const rpc = process.env.SOMNIA_RPC ?? "https://dream-rpc.somnia.network";
  const publicClient = createPublicClient({ chain: somniaShannon, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: somniaShannon, transport: http(rpc) });

  const collateral = SOMNIA_TESTNET_ADDRESSES.collateral;
  console.log(`\n▸ deployer   ${account.address}`);
  console.log(`▸ chain      Somnia Shannon (50312)`);
  console.log(`▸ collateral ${collateral}`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`▸ balance    ${balance} wei STT`);
  if (balance === 0n) fail("Deployer has 0 STT. Fund it at https://testnet.somnia.network then re-run.");

  console.log(`\n▸ deploying AnkerNote …`);
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [collateral, account.address],
  });
  console.log(`  tx ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) fail(`Deployment reverted (${receipt.status}).`);

  const record = {
    network: "somnia-shannon",
    chainId: 50312,
    ankerNote: receipt.contractAddress,
    collateral,
    deployer: account.address,
    deployTx: hash,
    blockNumber: Number(receipt.blockNumber),
    deployedAtMs: Date.now(),
  };
  mkdirSync("contracts/deployments", { recursive: true });
  writeFileSync("contracts/deployments/testnet.json", JSON.stringify(record, null, 2) + "\n");

  console.log(`\n  AnkerNote  ${receipt.contractAddress}`);
  console.log(`  explorer   https://shannon-explorer.somnia.network/address/${receipt.contractAddress}`);
  console.log(`\n  Add to .env:  NEXT_PUBLIC_ANKER_NOTE_ADDRESS=${receipt.contractAddress}\n`);
}

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)));
