import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.move', '.md']);
const DEFAULT_SCAN_ROOTS = ['app', 'src', 'packages', 'scripts', 'contracts', 'README.md'];

/** Rules that only apply inside packages/dex. */
const DEX_ONLY = (filePath) => filePath.startsWith('packages/dex/');
/**
 * Rules that apply everywhere EXCEPT the DreamDEX boundary itself and the
 * deploy tooling. `scripts/` legitimately needs the chain definition and the
 * collateral constant to deploy a contract; that is not market I/O.
 */
const OUTSIDE_DEX = (filePath) =>
  !filePath.startsWith('packages/dex/') &&
  !filePath.startsWith('scripts/') &&
  // Docs describe the configuration; naming an endpoint is not performing I/O.
  !filePath.endsWith('.md');

const FORBIDDEN_PATTERNS = [
  {
    ruleId: 'no-float-money-in-dex',
    scope: DEX_ONLY,
    // parseFloat/Number() on a money value, or a decimal literal used in math.
    pattern: /\b(?:parseFloat|toFixed)\s*\(|\b\d+\.\d+\s*[*/+-]|[*/+-]\s*\d+\.\d+/,
    message: 'packages/dex must do all money math in bigint; no float literals or parseFloat/toFixed.',
  },
  {
    ruleId: 'no-hardcoded-addresses',
    // A 20-byte hex literal. Protocol singletons come from the SDK's exported
    // constants; market/pool addresses are resolved at runtime and TTL-cached.
    pattern: /['"`]0x[0-9a-fA-F]{40}['"`]/,
    message: 'Do not hard-code contract addresses; read them from the SDK constants or resolve them at runtime.',
  },
  {
    ruleId: 'no-dreamdex-io-outside-dex',
    scope: OUTSIDE_DEX,
    // The market surface only. The `/chains` subpath is just a viem chain
    // definition (id, RPC, explorer) and carries no market I/O, so wallet
    // config may import it.
    pattern: /from\s+['"`]@somnia-chain\/markets-sdk['"`]|smk\.somnia\.host/,
    message: 'All DreamDEX market I/O must go through @anker/dex. No direct SDK import or indexer URL outside packages/dex.',
  },
  {
    ruleId: 'no-principal-plus-coupon-settlement',
    pattern:
      /\b(?:grossPayout|payoutAmount|claimPayout|redeemPayout|redeemAmount)\b[^;\n=]*=\s*[^;\n]*principal\s*\+\s*(?:Math\.max\(\s*0\s*,\s*)?[^;\n]*coupon/,
    message: 'Settlement must use reserve + coupon + realized leg payout, not principal + coupon.',
  },
  {
    ruleId: 'no-unsafe-rounded-bigint',
    pattern: /(?:BigInt\(Math\.max|Math\.max\(\s*[01]\s*,\s*Math\.round|Math\.max\(\s*0\s*,\s*Math\.round)/,
    message: 'Validate number-to-base-unit conversion before constructing bigint/u64 values.',
  },
  {
    ruleId: 'no-localhost-site-url-fallback',
    pattern: /NEXT_PUBLIC_SITE_URL\s*\?\?\s*['"`]https?:\/\/(?:127\.0\.0\.1|localhost)/,
    message:
      'metadataBase / NEXT_PUBLIC_SITE_URL must not fall back to localhost; use https://www.ankerprotocol.xyz so Vercel builds without env still emit public OG/canonical URLs.',
  },
];

const TEST_ASSERTION_ALLOWLIST = [
  /expect\(source\)\.not\.toMatch\(/,
  /expect\(.*\)\.not\.toContain\(/,
  /expect\(.*\)\.toThrow\(/,
];

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

export function shouldScanPath(filePath) {
  const normalized = normalizePath(filePath);
  if (normalized.includes('/node_modules/') || normalized.startsWith('node_modules/')) return false;
  if (normalized.includes('/.next/') || normalized.startsWith('.next/')) return false;
  // This file's fixtures ARE the forbidden patterns; scanning it self-flags.
  if (normalized === 'scripts/quality-gates.test.mjs') return false;
  if (normalized.includes('/artifacts/') || normalized.includes('/cache/')) return false;
  if (normalized.endsWith('.json') || normalized.endsWith('.lock')) return false;
  return SOURCE_EXTENSIONS.has(extname(normalized)) || normalized === 'README.md';
}

function isAllowedTestAssertion(filePath, line) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath) && TEST_ASSERTION_ALLOWLIST.some((pattern) => pattern.test(line));
}

export function scanForbiddenPatterns(files) {
  const findings = [];

  for (const file of files) {
    const filePath = normalizePath(file.filePath);
    if (!shouldScanPath(filePath)) continue;
    const lines = file.text.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (isAllowedTestAssertion(filePath, line)) return;
      for (const rule of FORBIDDEN_PATTERNS) {
        if (rule.scope && !rule.scope(filePath)) continue;
        if (rule.pattern.test(line)) {
          findings.push({
            filePath,
            line: index + 1,
            ruleId: rule.ruleId,
            message: rule.message,
            text: line.trim(),
          });
        }
      }
    });
  }

  return findings;
}

function collectFiles(root, cwd) {
  const fullPath = join(cwd, root);
  const stat = statSync(fullPath);
  if (stat.isFile()) {
    const filePath = normalizePath(relative(cwd, fullPath));
    return shouldScanPath(filePath) ? [{ filePath, text: readFileSync(fullPath, 'utf8') }] : [];
  }

  const files = [];
  for (const entry of readdirSync(fullPath)) {
    files.push(...collectFiles(join(root, entry), cwd));
  }
  return files;
}

export function scanWorkspace(cwd, roots = DEFAULT_SCAN_ROOTS) {
  return scanForbiddenPatterns(roots.flatMap((root) => collectFiles(root, cwd)));
}

function main() {
  const cwd = process.cwd();
  const findings = scanWorkspace(cwd);
  if (findings.length === 0) return;

  for (const finding of findings) {
    console.error(`${finding.filePath}:${finding.line} ${finding.ruleId}: ${finding.message}`);
    console.error(`  ${finding.text}`);
  }
  process.exitCode = 1;
}

const executedPath = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : '';
if (executedPath === fileURLToPath(import.meta.url)) {
  main();
}
