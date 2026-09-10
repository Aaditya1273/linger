import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
const ciWorkflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

describe('ci contract', () => {
  it('runs a production build in the npm ci script before browser tests', () => {
    expect(packageJson.scripts.ci.split(' && ')).toEqual(
      expect.arrayContaining([
        'npm run lint',
        'npm run test:unit',
        'npm run test:move',
        'npm run build',
        'npm run test:e2e',
      ]),
    );
    expect(packageJson.scripts.ci.indexOf('npm run test:move')).toBeGreaterThan(
      packageJson.scripts.ci.indexOf('npm run test:unit'),
    );
    expect(packageJson.scripts.ci.indexOf('npm run test:move')).toBeLessThan(
      packageJson.scripts.ci.indexOf('npm run build'),
    );
    expect(packageJson.scripts.ci.indexOf('npm run build')).toBeGreaterThan(
      packageJson.scripts.ci.indexOf('npm run test:unit'),
    );
    expect(packageJson.scripts.ci.indexOf('npm run build')).toBeLessThan(
      packageJson.scripts.ci.indexOf('npm run test:e2e'),
    );
  });

  it('runs a production build in GitHub Actions before browser tests', () => {
    expect(ciWorkflow).toMatch(/name: Production build[\s\S]*run: npm run build/);
    expect(ciWorkflow).toMatch(/name: Move tests[\s\S]*run: npm run test:move/);
    expect(ciWorkflow.indexOf('run: npm run test:move')).toBeGreaterThan(ciWorkflow.indexOf('run: npm run test:unit'));
    expect(ciWorkflow.indexOf('run: npm run test:move')).toBeLessThan(ciWorkflow.indexOf('run: npm run build'));
    expect(ciWorkflow.indexOf('run: npm run build')).toBeGreaterThan(ciWorkflow.indexOf('run: npm run test:unit'));
    expect(ciWorkflow.indexOf('npx playwright install')).toBeGreaterThan(ciWorkflow.indexOf('run: npm run build'));
  });
});
