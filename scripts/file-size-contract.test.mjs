import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MAX_LINES = [
  { file: 'src/components/DualInvestmentPage.tsx', max: 500 },
  { file: 'src/components/PortfolioPage.tsx', max: 500 },
  { file: 'src/sui/ankerTransactions.ts', max: 360 },
];

function lineCount(file) {
  return readFileSync(join(process.cwd(), file), 'utf8').split(/\r?\n/).length;
}

describe('large file split contract', () => {
  it.each(MAX_LINES)('$file stays below $max lines after refactoring', ({ file, max }) => {
    expect(lineCount(file)).toBeLessThanOrEqual(max);
  });
});
