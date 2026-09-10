import { describe, expect, it } from 'vitest';
import { ANKER_PROTOCOL, ANKER_TESTNET_DEPLOYMENT, resolveOriginalPackageId } from './anker';

const DEPLOYMENT_ORIGINAL = `0x${'d'.repeat(64)}`;
const ENV_LATEST = `0x${'e'.repeat(64)}`;
const ENV_ORIGINAL = `0x${'f'.repeat(64)}`;

describe('resolveOriginalPackageId', () => {
  it('prefers the explicit original-id override', () => {
    expect(
      resolveOriginalPackageId({
        envOriginalPackageId: ENV_ORIGINAL,
        envPackageId: ENV_LATEST,
        deploymentOriginalPackageId: DEPLOYMENT_ORIGINAL,
      }),
    ).toBe(ENV_ORIGINAL);
  });

  it('treats a lone package-id override as a fresh publish where both ids coincide', () => {
    expect(
      resolveOriginalPackageId({
        envOriginalPackageId: undefined,
        envPackageId: ENV_LATEST,
        deploymentOriginalPackageId: DEPLOYMENT_ORIGINAL,
      }),
    ).toBe(ENV_LATEST);
  });

  it('falls back to the checked-in deployment original id when no overrides are set', () => {
    expect(
      resolveOriginalPackageId({
        envOriginalPackageId: undefined,
        envPackageId: undefined,
        deploymentOriginalPackageId: DEPLOYMENT_ORIGINAL,
      }),
    ).toBe(DEPLOYMENT_ORIGINAL);
  });
});

describe('ANKER_PROTOCOL wiring', () => {
  it('carries both package ids from the testnet deployment', () => {
    expect(ANKER_PROTOCOL.packageId).toBe(ANKER_TESTNET_DEPLOYMENT.packageId);
    expect(ANKER_PROTOCOL.originalPackageId).toBe(ANKER_TESTNET_DEPLOYMENT.originalPackageId);
  });
});
