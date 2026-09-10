const STORAGE_KEY = 'anker.subscriptionDigests.v1';

interface SubscriptionDigestRecord {
  digest: string;
  recordedAtMs: number;
}

interface SubscriptionDigestInput {
  owner: string;
  quoteHash: string;
}

interface RecordSubscriptionDigestInput extends SubscriptionDigestInput {
  digest: string;
  recordedAtMs?: number;
}

function storageKey(input: SubscriptionDigestInput) {
  return `${input.owner.toLowerCase()}:${input.quoteHash}`;
}

function browserStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

function readRecords(storage = browserStorage()): Record<string, SubscriptionDigestRecord> {
  if (!storage) return {};
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, SubscriptionDigestRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function recordSubscriptionDigest(input: RecordSubscriptionDigestInput, storage = browserStorage()) {
  if (!storage || !input.owner || !input.quoteHash || !input.digest) return;
  const records = readRecords(storage);
  records[storageKey(input)] = {
    digest: input.digest,
    recordedAtMs: input.recordedAtMs ?? Date.now(),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function subscriptionDigestForQuote(input: SubscriptionDigestInput, storage = browserStorage()) {
  if (!storage || !input.owner || !input.quoteHash) return null;
  return readRecords(storage)[storageKey(input)]?.digest ?? null;
}
