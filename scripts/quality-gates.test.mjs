import { describe, expect, it } from 'vitest';
import { scanForbiddenPatterns, shouldScanPath } from './quality-gates.mjs';

describe('quality guardrails', () => {
  it('flags the principal+coupon settlement shortcut', () => {
    const findings = scanForbiddenPatterns([
      {
        filePath: 'src/products/settlement.ts',
        text: 'const grossPayout = note.principal + Math.max(0, note.coupon);',
      },
    ]);
    expect(findings.map((f) => f.ruleId)).toEqual(['no-principal-plus-coupon-settlement']);
  });

  it('flags unvalidated number-to-bigint conversion', () => {
    const findings = scanForbiddenPatterns([
      { filePath: 'packages/dex/src/money.ts', text: 'const raw = BigInt(Math.max(0, value));' },
    ]);
    expect(findings.map((f) => f.ruleId)).toEqual(['no-unsafe-rounded-bigint']);
  });

  it('flags localhost NEXT_PUBLIC_SITE_URL fallbacks that would bake bad OG URLs', () => {
    const findings = scanForbiddenPatterns([
      {
        filePath: 'app/[locale]/layout.tsx',
        text: "const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000';",
      },
      {
        filePath: 'app/[locale]/layout.tsx',
        text: "const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.ankerprotocol.xyz';",
      },
    ]);
    expect(findings.map((f) => f.ruleId)).toEqual(['no-localhost-site-url-fallback']);
  });

  it('bites on the three Somnia boundary rules', () => {
    // The Sui guardrails rotted into regexes that could never match. Assert
    // each new rule actually fires, and that the legitimate chain-definition
    // import does not.
    const findings = scanForbiddenPatterns([
      { filePath: 'packages/dex/src/index.ts', text: 'const cost = qty * 0.85;' },
      { filePath: 'src/components/BuyLowPage.tsx', text: "import { SomniaMarkets } from '@somnia-chain/markets-sdk';" },
      { filePath: 'src/wallet/config.ts', text: "const pool = '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E';" },
      { filePath: 'src/wallet/config.ts', text: "import { somniaShannon } from '@somnia-chain/markets-sdk/chains';" },
    ]);
    expect(findings.map((f) => f.ruleId)).toEqual([
      'no-float-money-in-dex',
      'no-dreamdex-io-outside-dex',
      'no-hardcoded-addresses',
    ]);
  });

  it('scans the dex package but never its own fixture file', () => {
    expect(shouldScanPath('packages/dex/src/index.ts')).toBe(true);
    expect(shouldScanPath('scripts/quality-gates.test.mjs')).toBe(false);
  });
});
