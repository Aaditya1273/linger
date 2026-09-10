import { describe, expect, it } from 'vitest';
import deploymentFixture from './vendor/deepbook-predict/deployment.testnet.json';
import {
  ACCUMULATOR_ROOT,
  parsePredictDeployment,
  TURBO_CADENCE_NAME,
} from './predictDeployment';

describe('parsePredictDeployment', () => {
  it('parses vendored 8-04 deployment into runtime package and shared-object IDs', () => {
    const config = parsePredictDeployment(deploymentFixture);

    expect(config.network).toBe('testnet');
    expect(config.packages.predict).toBe(
      '0xfe742239a3b033f7d52ed5275f238c17d27498ca0ee5ea5672ea732eb3f4dbbb',
    );
    expect(config.packages.account).toBe(
      '0xbdbb60b00f2d4f30daeff62f2c642b18433a8fcdfbebccc808df578df2a0c203',
    );
    expect(config.packages.propbook).toBe(
      '0xed1295ff3c9a9415766afff20a74cdf2e362647be09aaf13b809302c0109e912',
    );
    expect(config.packages.fixedMath).toBe(
      '0xdf0bd2a0d201562f2bdecb1b77d7998c7af316f6fd7d1eab9b9035064f21bfd4',
    );
    expect(config.packages.bsSid).toBe(
      '0x6a54299d593fca24edf6b17bf8c3aff0b7ba8bc8f4276e9c1065689c50223bba',
    );
    expect(config.packages.bsOracle).toBe(
      '0x9d2cf38611d971a0e918b93fc0113d279f5c923f43e62c407a9ad0f9d82f6698',
    );

    expect(config.sharedObjects.protocolConfig).toBe(
      '0x43703ceee4d5f5a9e8cbf728071c34dc65961dd6e878fafd9ac36d86a9a4ce5b',
    );
    expect(config.sharedObjects.poolVault).toBe(
      '0xeef535e7fcb850a943807ce48cc543c6d990b39e68a7bc47d0b56651ff20ab0a',
    );
    expect(config.sharedObjects.predictRegistry).toBe(
      '0x35970bfd0ff3703cb38b3fff3a3fbb0bc0e5638e7c747af3a8e42e2c95d353f0',
    );
    expect(config.sharedObjects.oracleRegistry).toBe(
      '0xc1dffc5f7a5404cb002ba3bd7c50d6a2dbe8bb6afd40080cd663965deff9d577',
    );
    expect(config.sharedObjects.accountRegistry).toBe(
      '0x21a7ed28397363b5550853c1f08795731257de81028cd1bf87f20c0752c8ca2f',
    );

    expect(config.accumulatorRoot).toBe(ACCUMULATOR_ROOT);
    expect(config.quoteAssetType).toBe(
      '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
    );
    expect(config.quoteAssetDecimals).toBe(6);

    expect(config.sharedObjects.pythFeed).toBe(
      '0xccafaa6c5a41f0493585cf268f2b4dc14c91ed798362444144cac2c745db8dde',
    );
    expect(config.sharedObjects.blockScholesValueStore).toBe(
      '0x6d9de17954f4c1a2f01fdd97c0bb8a2e682c1fea0f8f048dcd127d543a6ac051',
    );
    expect(config.sharedObjects.blockScholesSviStore).toBe(
      '0x83c2d6307fd3591228052fc0d24c4f00a698b0eb4fef5e6083a213ca0d54bd35',
    );
    expect(config.oracle).toEqual({
      propbookUnderlyingId: 1,
      pythSourceId: 1,
      blockScholesSourceId: 1,
    });

    expect(config.endpoints.predictServerUrl).toBe(
      'https://predict-server-beta.testnet.mystenlabs.com',
    );
    expect(config.endpoints.propbookServerUrl).toBe(
      'https://propbook.api.testnet.mystenlabs.com',
    );
    expect(config.endpoints.grpcUrl).toBe('https://fullnode.testnet.sui.io:443');
    expect(config.endpoints.graphqlUrl).toBe('https://graphql.testnet.sui.io/graphql');
  });

  it('exposes the Turbo 1h cadence fingerprint used to filter Expiry Markets', () => {
    const config = parsePredictDeployment(deploymentFixture);
    const turbo = config.cadences.find((cadence) => cadence.name === TURBO_CADENCE_NAME);

    expect(turbo).toEqual({
      id: 2,
      name: '1h',
      tickSize: '10000000',
      admissionTickSize: '1000000000',
      maxExpiryAllocation: '250000000000',
      initialExpiryCash: '50000000000',
      windowSize: '3',
    });
  });

  it('rejects deployment payloads missing required package IDs', () => {
    expect(() => parsePredictDeployment({ ...deploymentFixture, packages: {} })).toThrow(
      /packages\./,
    );
  });
});
