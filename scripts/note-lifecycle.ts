/**
 * Prove the AnkerNote lifecycle on Shannon: subscribe -> read -> claim.
 *
 *   npm run note:lifecycle
 *
 * This exercises the exact calls the UI makes, with a real signer against the
 * deployed contract, so the claim path is proven rather than merely wired. It
 * needs STT for gas and tUSDC for the performance fee (the SDK faucet mints the
 * latter; scripts/smoke.ts already does that).
 */
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, erc20Abi, http, type Abi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

function loadEnv(paths = ['.env.local', '.env']): void {
  for (const path of paths) {
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]?.replace(/^["']|["']$/g, '') ?? '';
    }
  }
}

function fail(msg: string): never {
  console.error(`\n  FAIL  ${msg}\n`);
  process.exit(1);
}

const EXPLORER = somniaShannon.blockExplorers.default.url;

async function main(): Promise<void> {
  loadEnv();
  const rawKey = (process.env.BURNER_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? '').trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(rawKey)) fail('Set PRIVATE_KEY in .env.local.');
  const key = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex;

  const deployment = JSON.parse(readFileSync('contracts/deployments/testnet.json', 'utf8')) as {
    ankerNote: Hex;
    collateral: Hex;
  };
  const { abi } = JSON.parse(readFileSync('contracts/build/AnkerNote.json', 'utf8')) as { abi: Abi };

  const account = privateKeyToAccount(key);
  const rpc = process.env.SOMNIA_RPC ?? 'https://dream-rpc.somnia.network';
  const publicClient = createPublicClient({ chain: somniaShannon, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: somniaShannon, transport: http(rpc) });
  const note = { abi, address: deployment.ankerNote } as const;

  console.log(`\n▸ signer     ${account.address}`);
  console.log(`▸ AnkerNote  ${deployment.ankerNote}`);

  // Terms mirroring what the UI computes: 100 USDso, 2% option budget.
  const DEC = 10n ** 6n;
  const principal = 100n * DEC;
  const legCost = (principal * 200n) / 10_000n; // 2%
  const quantity = (legCost * DEC) / 850_000n; // ask 0.85
  const coupon = quantity - legCost;
  const reserve = principal > quantity ? principal - quantity : 0n;
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3_600);
  const marketId = '0x000000000000000000000000000000000000000000000000000000000001a13d';

  console.log(`\n▸ subscribing (principal ${principal}, coupon ${coupon}) …`);
  const subHash = await wallet.writeContract({
    ...note,
    functionName: 'subscribe',
    args: [principal, reserve, coupon, 7_700_000n, 7_700_000n, 500n, expiry, [marketId], [quantity], [legCost]],
  });
  const subReceipt = await publicClient.waitForTransactionReceipt({ hash: subHash });
  if (subReceipt.status !== 'success') fail(`subscribe reverted (${subHash})`);
  console.log(`  tx ${subHash}`);
  console.log(`  ${EXPLORER}/tx/${subHash}`);

  const tokenId = (await publicClient.readContract({
    ...note,
    functionName: 'tokenOfOwnerByIndex',
    args: [account.address, 0n],
  })) as bigint;
  console.log(`\n▸ minted     Note #${tokenId}`);

  const stored = (await publicClient.readContract({ ...note, functionName: 'getNote', args: [tokenId] })) as {
    principal: bigint;
    coupon: bigint;
    feeBpsSnapshot: bigint;
    status: number;
  };
  console.log(`  principal      ${stored.principal}`);
  console.log(`  coupon         ${stored.coupon}`);
  console.log(`  feeBpsSnapshot ${stored.feeBpsSnapshot}`);
  console.log(`  status         ${stored.status} (0 = Open)`);
  if (stored.principal !== principal) fail('stored principal does not match what was submitted');

  const fee = (await publicClient.readContract({ ...note, functionName: 'quoteFee', args: [tokenId] })) as bigint;
  console.log(`\n▸ fee owed   ${fee} (10% of coupon ${stored.coupon})`);
  if (fee !== (stored.coupon * stored.feeBpsSnapshot) / 10_000n) fail('quoteFee disagrees with the snapshot');

  if (fee > 0n) {
    const balance = (await publicClient.readContract({
      abi: erc20Abi,
      address: deployment.collateral,
      functionName: 'balanceOf',
      args: [account.address],
    })) as bigint;
    console.log(`▸ tUSDC held ${balance}`);
    if (balance < fee) fail(`Need ${fee} tUSDC for the fee, hold ${balance}. Run npm run smoke to faucet.`);

    console.log(`▸ approving fee …`);
    const approveHash = await wallet.writeContract({
      abi: erc20Abi,
      address: deployment.collateral,
      functionName: 'approve',
      args: [deployment.ankerNote, fee],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`  tx ${approveHash}`);
  }

  console.log(`\n▸ claiming …`);
  const claimHash = await wallet.writeContract({
    ...note,
    functionName: 'recordRedeemWithFee',
    args: [tokenId, reserve + coupon],
  });
  const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: claimHash });
  if (claimReceipt.status !== 'success') fail(`claim reverted (${claimHash})`);
  console.log(`  tx ${claimHash}`);
  console.log(`  ${EXPLORER}/tx/${claimHash}`);

  const after = (await publicClient.readContract({ ...note, functionName: 'getNote', args: [tokenId] })) as {
    status: number;
  };
  console.log(`\n▸ status now ${after.status} (1 = Redeemed)`);
  if (after.status !== 1) fail('note did not flip to Redeemed');

  console.log(`\n  LIFECYCLE PROVEN: subscribe -> getNote -> quoteFee -> approve -> claim\n`);
  process.exit(0);
}

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)));
