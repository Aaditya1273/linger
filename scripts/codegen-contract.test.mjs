import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
const configPath = join(process.cwd(), 'sui-codegen.config.ts');

describe('Sui codegen contract', () => {
  it('pins @mysten/codegen and exposes repeatable generation scripts', () => {
    expect(packageJson.devDependencies['@mysten/codegen']).toBe('^0.11.1');
    expect(packageJson.scripts['codegen:summary']).toBe('cd contracts/anker_protocol && sui move summary');
    expect(packageJson.scripts.codegen).toBe('sui-ts-codegen generate');
  });

  it('targets the local Anker Move package output', () => {
    expect(existsSync(configPath)).toBe(true);
    const config = readFileSync(configPath, 'utf8');

    expect(config).toContain("output: './src/generated'");
    expect(config).toContain("package: '@local-pkg/anker-protocol'");
    expect(config).toContain("path: './contracts/anker_protocol'");
    expect(config).toContain('prune: true');
  });
});
