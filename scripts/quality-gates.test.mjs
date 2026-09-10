import { describe, expect, it } from 'vitest';
import { scanForbiddenPatterns, shouldScanPath } from './quality-gates.mjs';

describe('quality guardrails', () => {
  it('flags review-forbidden source patterns', () => {
    const findings = scanForbiddenPatterns([
      {
        filePath: 'src/components/TargetBuyExecutionPanel.tsx',
        text: [
          'const manager = managersQuery.data?.[0];',
          'const grossPayout = note.principal + Math.max(0, note.coupon);',
        ].join('\n'),
      },
    ]);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      'no-first-manager-selection',
      'no-principal-plus-coupon-settlement',
    ]);
  });

  it('scans experimental code and ignores only test-only source assertions', () => {
    expect(shouldScanPath('src/experimental/sharkFin/product.ts')).toBe(true);

    const findings = scanForbiddenPatterns([
      {
        filePath: 'src/sui/productNoteContractEvents.test.ts',
        text: 'expect(source).not.toMatch(/public fun new_dual_investment_note<Asset>\\(/);',
      },
      {
        filePath: 'src/hooks/useExampleQuote.ts',
        text: "import { buildVerifiedSharkFinQuote } from '../experimental/sharkFin/useSharkFinQuote';",
      },
      {
        filePath: 'src/products/riskMetrics.ts',
        text: 'const maximumPayout = quote.principal + quote.coupon;',
      },
    ]);

    expect(findings.map((finding) => finding.ruleId)).toEqual(['no-live-shark-fin-product-path']);
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

    expect(findings.map((finding) => finding.ruleId)).toEqual(['no-localhost-site-url-fallback']);
  });
});
