import testnetDeployment from '../../contracts/anker_protocol/deployments/testnet.json';

export const ANKER_TESTNET_DEPLOYMENT = testnetDeployment;

/**
 * The original (v1) package id anchors on-chain type identity across upgrades,
 * while `packageId` tracks the latest published version for call targets (ADR-0003).
 * When only NEXT_PUBLIC_ANKER_PACKAGE_ID is set, the override is treated as a fresh
 * first publish where both ids coincide — never mixed with the checked-in deployment.
 */
export function resolveOriginalPackageId(input: {
  envOriginalPackageId: string | undefined;
  envPackageId: string | undefined;
  deploymentOriginalPackageId: string;
}) {
  return input.envOriginalPackageId ?? input.envPackageId ?? input.deploymentOriginalPackageId;
}

export const ANKER_PROTOCOL = {
  packageId: process.env.NEXT_PUBLIC_ANKER_PACKAGE_ID ?? ANKER_TESTNET_DEPLOYMENT.packageId,
  originalPackageId: resolveOriginalPackageId({
    envOriginalPackageId: process.env.NEXT_PUBLIC_ANKER_ORIGINAL_PACKAGE_ID,
    envPackageId: process.env.NEXT_PUBLIC_ANKER_PACKAGE_ID,
    deploymentOriginalPackageId: ANKER_TESTNET_DEPLOYMENT.originalPackageId,
  }),
  registryId: process.env.NEXT_PUBLIC_ANKER_REGISTRY_ID ?? ANKER_TESTNET_DEPLOYMENT.registryId,
  adminCapId: process.env.NEXT_PUBLIC_ANKER_ADMIN_CAP_ID ?? ANKER_TESTNET_DEPLOYMENT.adminCapId,
  upgradeCapId: ANKER_TESTNET_DEPLOYMENT.upgradeCapId,
  publishDigest: ANKER_TESTNET_DEPLOYMENT.publishDigest,
} as const;
