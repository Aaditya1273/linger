#!/usr/bin/env node
/**
 * Apply a fresh anker_protocol publish to the checked-in deployment record.
 *
 * Usage:
 *   cd contracts/anker_protocol && sui client publish --json > publish.json
 *   node ../../scripts/apply-anker-publish.mjs contracts/anker_protocol/publish.json
 *
 * A publish (not an upgrade) is required when the Predict `account` dependency
 * changes identity — AccountWrapper's type changes, which is upgrade-incompatible.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const publishPath = process.argv[2] ?? join(repoRoot, 'contracts/anker_protocol/publish.json');
const result = JSON.parse(readFileSync(publishPath, 'utf8'));

const status = result.effects?.status?.status ?? result.effects?.status;
if (status !== 'success') {
  throw new Error(`Publish transaction did not succeed: ${JSON.stringify(result.effects?.status)}`);
}

const changes = result.objectChanges ?? [];
const published = changes.find((change) => change.type === 'published');
if (!published) throw new Error('No published package in objectChanges.');

function createdOfType(suffix) {
  const match = changes.find(
    (change) => change.type === 'created' && change.objectType?.endsWith(suffix),
  );
  if (!match) throw new Error(`No created object of type ${suffix} in objectChanges.`);
  return match.objectId;
}

const record = {
  network: 'testnet',
  chainId: '4c78adac',
  publisher: result.transaction?.data?.sender ?? changes.find((c) => c.sender)?.sender,
  packageId: published.packageId,
  originalPackageId: published.packageId,
  registryId: createdOfType('::product_note::Registry'),
  adminCapId: createdOfType('::product_note::AdminCap'),
  upgradeCapId: createdOfType('::package::UpgradeCap'),
  publishDigest: result.digest,
  publishedAtMs: Number(result.timestampMs ?? Date.now()),
};

const deploymentPath = join(repoRoot, 'contracts/anker_protocol/deployments/testnet.json');
writeFileSync(deploymentPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(`Wrote ${deploymentPath}`);

const mappingPath = join(repoRoot, 'contracts/anker_protocol/package_summaries/address_mapping.json');
const mapping = JSON.parse(readFileSync(mappingPath, 'utf8'));
mapping.anker_protocol = record.originalPackageId;
mapping.account = '0xbdbb60b00f2d4f30daeff62f2c642b18433a8fcdfbebccc808df578df2a0c203';
writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`);
console.log(`Wrote ${mappingPath}`);

console.log('\nNew deployment record:');
console.log(JSON.stringify(record, null, 2));
