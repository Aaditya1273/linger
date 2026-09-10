import { PREDICT_DEPLOYMENT, minuteCadences, turboCadence } from './predictDeployment';

export type ProtocolNetwork = 'testnet';

export function resolveProtocolNetwork(network = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet'): ProtocolNetwork {
  if (network !== 'testnet') {
    throw new Error('Anker Protocol is only configured for Sui testnet. Remove the network override or set it to testnet.');
  }
  return 'testnet';
}

export const SUI_GRPC_URL = PREDICT_DEPLOYMENT.endpoints.grpcUrl;
export const SUI_GRAPHQL_URL = PREDICT_DEPLOYMENT.endpoints.graphqlUrl;

export const DEEPBOOK_PREDICT = {
  packageId: PREDICT_DEPLOYMENT.packages.predict,
  accountPackageId: PREDICT_DEPLOYMENT.packages.account,
  propbookPackageId: PREDICT_DEPLOYMENT.packages.propbook,
  protocolConfigId: PREDICT_DEPLOYMENT.sharedObjects.protocolConfig,
  poolVaultId: PREDICT_DEPLOYMENT.sharedObjects.poolVault,
  predictRegistryId: PREDICT_DEPLOYMENT.sharedObjects.predictRegistry,
  oracleRegistryId: PREDICT_DEPLOYMENT.sharedObjects.oracleRegistry,
  accountRegistryId: PREDICT_DEPLOYMENT.sharedObjects.accountRegistry,
  accumulatorRoot: PREDICT_DEPLOYMENT.accumulatorRoot,
  pythFeedId: PREDICT_DEPLOYMENT.sharedObjects.pythFeed,
  blockScholesValueStoreId: PREDICT_DEPLOYMENT.sharedObjects.blockScholesValueStore,
  blockScholesSviStoreId: PREDICT_DEPLOYMENT.sharedObjects.blockScholesSviStore,
  bsSidPackageId: PREDICT_DEPLOYMENT.packages.bsSid,
  oracle: PREDICT_DEPLOYMENT.oracle,
  turboCadence: turboCadence(PREDICT_DEPLOYMENT),
  minuteCadences: minuteCadences(PREDICT_DEPLOYMENT),
  quoteAssetType: PREDICT_DEPLOYMENT.quoteAssetType,
  quoteAssetDecimals: PREDICT_DEPLOYMENT.quoteAssetDecimals,
  baseSpread: PREDICT_DEPLOYMENT.pricing.baseSpread,
  minSpread: PREDICT_DEPLOYMENT.pricing.minSpread,
  utilizationMultiplier: PREDICT_DEPLOYMENT.pricing.utilizationMultiplier,
  minAskPrice: PREDICT_DEPLOYMENT.pricing.minAskPrice,
  maxAskPrice: PREDICT_DEPLOYMENT.pricing.maxAskPrice,
  underlyingAsset: PREDICT_DEPLOYMENT.underlyingAsset,
} as const;

export const SUI_NETWORK = resolveProtocolNetwork();
