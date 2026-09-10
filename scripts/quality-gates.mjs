import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.move', '.md']);
const DEFAULT_SCAN_ROOTS = ['app', 'src', 'contracts', 'tests', 'README.md'];

const FORBIDDEN_PATTERNS = [
  {
    ruleId: 'no-first-manager-selection',
    pattern: /managersQuery\.data\?\.\[0\]/,
    message: 'Do not select the first PredictManager; subscriptions must use an owned unallocated manager.',
  },
  {
    ruleId: 'no-public-product-note-constructor',
    pattern: /public fun new_dual_investment_note<Asset>\(/,
    message: 'ProductNote construction must stay behind the protocol subscription entry point.',
  },
  {
    ruleId: 'no-transferable-product-note',
    pattern: /ProductNote<[^>]+> has key,\s*store/,
    message: 'ProductNote must not regain store; static owner semantics would become unsafe.',
  },
  {
    ruleId: 'no-principal-plus-coupon-settlement',
    pattern:
      /\b(?:grossPayout|payoutAmount|claimPayout|redeemPayout|redeemAmount)\b[^;\n=]*=\s*[^;\n]*principal\s*\+\s*(?:Math\.max\(\s*0\s*,\s*)?[^;\n]*coupon/,
    message: 'Settlement must use reserve + coupon + realized leg payout, not principal + coupon.',
  },
  {
    ruleId: 'no-live-shark-fin-product-path',
    pattern: /(?:src\/products\/sharkFin|useSharkFinQuote|buildSubscribeSharkFin)/,
    message: 'Shark Fin must stay out of live frontend subscription paths.',
  },
  {
    ruleId: 'no-preview-execution-adapter',
    pattern: /(?:executionAdapter|previewOnlyExecutionAdapter)/,
    message: 'Preview-only execution adapters must not be used in live subscription paths.',
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
  if (normalized.includes('/contracts/anker_protocol/build/')) return false;
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
