import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
const ciWorkflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

const order = (haystack, ...needles) => needles.map((n) => haystack.indexOf(n));
const isAscending = (xs) => xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1]));

describe('ci contract', () => {
  it('lints, tests, then builds before browser tests in the npm ci script', () => {
    const steps = packageJson.scripts.ci.split(' && ');
    expect(steps).toEqual(expect.arrayContaining(['npm run lint', 'npm run test:unit', 'npm run build']));
    expect(isAscending(order(packageJson.scripts.ci, 'npm run lint', 'npm run test:unit', 'npm run build'))).toBe(true);
  });

  it('runs a production build in GitHub Actions before browser tests', () => {
    expect(ciWorkflow).toMatch(/name: Production build[\s\S]*run: npm run build/);
    expect(isAscending(order(ciWorkflow, 'run: npm run test:unit', 'run: npm run build', 'npx playwright install'))).toBe(
      true,
    );
  });

  it('never puts the signing smoke script in CI', () => {
    // smoke.ts places a real order with a real key. A CI runner must not hold one.
    expect(ciWorkflow).not.toMatch(/^\s*run: npm run smoke/m);
  });
});
