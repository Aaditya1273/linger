import deploymentTestnet from './vendor/deepbook-predict/deployment.testnet.json';

export const TURBO_CADENCE_NAME = '1h' as const;

/** Framework AccumulatorRoot used by account fund settlement (not in deployment JSON). */
export const ACCUMULATOR_ROOT =
  '0x0000000000000000000000000000000000000000000000000000000000000acc';

const DEFAULT_PREDICT_SERVER_URL = 'https://predict-server-beta.testnet.mystenlabs.com';
const DEFAULT_PROPBOOK_SERVER_URL = 'https://propbook.api.testnet.mystenlabs.com';
const DEFAULT_GRPC_URL = 'https://fullnode.testnet.sui.io:443';
const DEFAULT_GRAPHQL_URL = 'https://graphql.testnet.sui.io/graphql';

export interface PredictCadenceConfig {
  id: number;
  name: string;
  tickSize: string;
  admissionTickSize: string;
  maxExpiryAllocation: string;
  initialExpiryCash: string;
  windowSize: string;
}

export interface PredictDeploymentConfig {
  network: 'testnet';
  packages: {
    fixedMath: string;
    account: string;
    propbook: string;
    predict: string;
    /** Block Scholes series-id derivation package (propbook dependency). */
    bsSid: string;
    /** Block Scholes signed-oracle verifier package (propbook dependency). */
    bsOracle: string;
  };
  sharedObjects: {
    accountRegistry: string;
    oracleRegistry: string;
    poolVault: string;
    protocolConfig: string;
    predictRegistry: string;
    /** Propbook oracle stores (8-04 architecture: one Pyth feed + two Block Scholes stores). */
    pythFeed: string;
    blockScholesValueStore: string;
    blockScholesSviStore: string;
  };
  oracle: {
    propbookUnderlyingId: number;
    pythSourceId: number;
    blockScholesSourceId: number;
  };
  cadences: PredictCadenceConfig[];
  quoteAssetType: string;
  quoteAssetDecimals: number;
  accumulatorRoot: string;
  endpoints: {
    predictServerUrl: string;
    propbookServerUrl: string;
    grpcUrl: string;
    graphqlUrl: string;
  };
  /** Spread / ask bounds used by off-chain display pricing (not upstream deployment fields). */
  pricing: {
    baseSpread: number;
    minSpread: number;
    utilizationMultiplier: number;
    minAskPrice: number;
    maxAskPrice: number;
  };
  underlyingAsset: 'BTC';
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function requireString(record: UnknownRecord, path: string, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Predict deployment missing ${path}.${key}`);
  }
  return value;
}

function requireNumber(record: UnknownRecord, path: string, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Predict deployment missing ${path}.${key}`);
  }
  return value;
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(`Predict deployment missing ${path}`);
  }
  return value;
}

function parseCadence(value: unknown, index: number): PredictCadenceConfig {
  const cadence = requireRecord(value, `wiring.cadences[${index}]`);
  return {
    id: requireNumber(cadence, `wiring.cadences[${index}]`, 'id'),
    name: requireString(cadence, `wiring.cadences[${index}]`, 'name'),
    tickSize: requireString(cadence, `wiring.cadences[${index}]`, 'tickSize'),
    admissionTickSize: requireString(cadence, `wiring.cadences[${index}]`, 'admissionTickSize'),
    maxExpiryAllocation: requireString(cadence, `wiring.cadences[${index}]`, 'maxExpiryAllocation'),
    initialExpiryCash: requireString(cadence, `wiring.cadences[${index}]`, 'initialExpiryCash'),
    windowSize: requireString(cadence, `wiring.cadences[${index}]`, 'windowSize'),
  };
}

export function parsePredictDeployment(payload: unknown): PredictDeploymentConfig {
  const root = requireRecord(payload, 'deployment');
  const packages = requireRecord(root.packages, 'packages');
  const linked = requireRecord(root.linked, 'linked');
  const sharedObjects = requireRecord(root.sharedObjects, 'sharedObjects');
  const accountShared = requireRecord(sharedObjects.account, 'sharedObjects.account');
  const propbookShared = requireRecord(sharedObjects.propbook, 'sharedObjects.propbook');
  const predictShared = requireRecord(sharedObjects.predict, 'sharedObjects.predict');
  const wiring = requireRecord(root.wiring, 'wiring');
  const asset = requireRecord(wiring.asset, 'wiring.asset');
  if (!Array.isArray(wiring.cadences)) {
    throw new Error('Predict deployment missing wiring.cadences');
  }

  const dusdcPackage = requireString(linked, 'linked', 'dusdc');

  return {
    network: 'testnet',
    packages: {
      fixedMath: requireString(packages, 'packages', 'fixed_math'),
      account: requireString(packages, 'packages', 'account'),
      propbook: requireString(packages, 'packages', 'propbook'),
      predict: requireString(packages, 'packages', 'predict'),
      bsSid: requireString(linked, 'linked', 'bs_sid'),
      bsOracle: requireString(linked, 'linked', 'bs_oracle'),
    },
    sharedObjects: {
      accountRegistry: requireString(accountShared, 'sharedObjects.account', 'account_registry::AccountRegistry'),
      oracleRegistry: requireString(propbookShared, 'sharedObjects.propbook', 'registry::OracleRegistry'),
      poolVault: requireString(predictShared, 'sharedObjects.predict', 'plp::PoolVault'),
      protocolConfig: requireString(predictShared, 'sharedObjects.predict', 'protocol_config::ProtocolConfig'),
      predictRegistry: requireString(predictShared, 'sharedObjects.predict', 'registry::Registry'),
      pythFeed: requireString(propbookShared, 'sharedObjects.propbook', 'pyth_feed::PythFeed'),
      blockScholesValueStore: requireString(
        propbookShared,
        'sharedObjects.propbook',
        'block_scholes_store::BlockScholesValueStore',
      ),
      blockScholesSviStore: requireString(
        propbookShared,
        'sharedObjects.propbook',
        'block_scholes_store::BlockScholesSVIStore',
      ),
    },
    oracle: {
      propbookUnderlyingId: requireNumber(asset, 'wiring.asset', 'propbookUnderlyingId'),
      pythSourceId: requireNumber(asset, 'wiring.asset', 'pythSourceId'),
      blockScholesSourceId: requireNumber(asset, 'wiring.asset', 'blockScholesSourceId'),
    },
    cadences: wiring.cadences.map(parseCadence),
    quoteAssetType: `${dusdcPackage}::dusdc::DUSDC`,
    quoteAssetDecimals: 6,
    accumulatorRoot: ACCUMULATOR_ROOT,
    endpoints: {
      predictServerUrl:
        process.env.NEXT_PUBLIC_PREDICT_SERVER_URL ?? DEFAULT_PREDICT_SERVER_URL,
      propbookServerUrl:
        process.env.NEXT_PUBLIC_PROPBOOK_SERVER_URL ?? DEFAULT_PROPBOOK_SERVER_URL,
      grpcUrl: process.env.NEXT_PUBLIC_SUI_GRPC_URL ?? DEFAULT_GRPC_URL,
      graphqlUrl: process.env.NEXT_PUBLIC_SUI_GRAPHQL_URL ?? DEFAULT_GRAPHQL_URL,
    },
    pricing: {
      baseSpread: 0.02,
      minSpread: 0.005,
      utilizationMultiplier: 2,
      minAskPrice: 0.01,
      maxAskPrice: 0.99,
    },
    underlyingAsset: 'BTC',
  };
}

export const PREDICT_DEPLOYMENT = parsePredictDeployment(deploymentTestnet);

export function turboCadence(config: PredictDeploymentConfig = PREDICT_DEPLOYMENT): PredictCadenceConfig {
  const cadence = config.cadences.find((item) => item.name === TURBO_CADENCE_NAME);
  if (!cadence) {
    throw new Error(`Predict deployment is missing the ${TURBO_CADENCE_NAME} cadence`);
  }
  return cadence;
}

/** Minute-scale cadences (1m/5m today) — never offered as products (ADR-0002). */
export function minuteCadences(config: PredictDeploymentConfig = PREDICT_DEPLOYMENT): PredictCadenceConfig[] {
  return config.cadences.filter((item) => /^\d+m$/.test(item.name));
}
