/**
 * Compile contracts/AnkerNote.sol with solc-js and emit an artifact the app
 * and the deploy script both read. No Hardhat/Foundry — the whole contract
 * surface is one file, so a framework would be more config than code.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import solc from 'solc';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const SOURCE = 'contracts/AnkerNote.sol';

/** Resolve `@openzeppelin/...` imports out of node_modules for solc. */
function findImport(importPath) {
  try {
    const onDisk = importPath.startsWith('.')
      ? resolve(ROOT, importPath)
      : require.resolve(importPath, { paths: [ROOT] });
    return { contents: readFileSync(onDisk, 'utf8') };
  } catch (error) {
    return { error: `not found: ${importPath} (${error.message})` };
  }
}

const input = {
  language: 'Solidity',
  sources: { [SOURCE]: { content: readFileSync(join(ROOT, SOURCE), 'utf8') } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    // Required: `note.strikes = strikes` copies a nested dynamic array from
    // calldata to storage, which the legacy code generator cannot emit.
    viaIR: true,
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
const errors = (output.errors ?? []).filter((e) => e.severity === 'error');
if (errors.length > 0) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const warning of (output.errors ?? []).filter((e) => e.severity === 'warning')) {
  console.warn('warn:', warning.formattedMessage.split('\n')[0]);
}

const artifact = output.contracts[SOURCE].AnkerNote;
const out = join(ROOT, 'contracts/build/AnkerNote.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` }, null, 2) + '\n',
);
console.log(`compiled -> contracts/build/AnkerNote.json (${artifact.evm.bytecode.object.length / 2} bytes)`);
