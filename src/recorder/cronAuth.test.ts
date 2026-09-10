import { describe, expect, it } from 'vitest';
import { authorizeCronRequest } from './cronAuth';

describe('authorizeCronRequest', () => {
  it('accepts Authorization Bearer matching CRON_SECRET', () => {
    expect(
      authorizeCronRequest({
        authorizationHeader: 'Bearer super-secret',
        cronSecret: 'super-secret',
      }),
    ).toBe(true);
  });

  it('rejects missing or wrong secrets', () => {
    expect(
      authorizeCronRequest({
        authorizationHeader: null,
        cronSecret: 'super-secret',
      }),
    ).toBe(false);
    expect(
      authorizeCronRequest({
        authorizationHeader: 'Bearer wrong',
        cronSecret: 'super-secret',
      }),
    ).toBe(false);
    expect(
      authorizeCronRequest({
        authorizationHeader: 'Bearer super-secret',
        cronSecret: '',
      }),
    ).toBe(false);
  });
});
