import { describe, expect, it } from 'vitest';
import { recordSubscriptionDigest, subscriptionDigestForQuote } from './subscriptionDigestStore';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('subscription digest store', () => {
  it('stores a subscription transaction digest by owner and quote hash', () => {
    const storage = memoryStorage();

    recordSubscriptionDigest(
      {
        owner: `0x${'A'.repeat(64)}`,
        quoteHash: '0xquote',
        digest: '0xsubscribe',
        recordedAtMs: 1,
      },
      storage,
    );

    expect(
      subscriptionDigestForQuote(
        {
          owner: `0x${'a'.repeat(64)}`,
          quoteHash: '0xquote',
        },
        storage,
      ),
    ).toBe('0xsubscribe');
  });

  it('does not leak digests between owners or quote hashes', () => {
    const storage = memoryStorage();
    recordSubscriptionDigest({ owner: '0xowner-a', quoteHash: '0xquote-a', digest: '0xdigest-a' }, storage);

    expect(subscriptionDigestForQuote({ owner: '0xowner-b', quoteHash: '0xquote-a' }, storage)).toBeNull();
    expect(subscriptionDigestForQuote({ owner: '0xowner-a', quoteHash: '0xquote-b' }, storage)).toBeNull();
  });
});
