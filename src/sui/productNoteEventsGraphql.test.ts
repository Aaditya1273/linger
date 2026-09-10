import { describe, expect, it, vi } from 'vitest';
import { buildProductNoteEventIndex } from './productNoteEvents';
import {
  createGraphqlProductNoteEventClient,
  PRODUCT_NOTE_EVENT_PAGE_SIZE,
} from './productNoteEventsGraphql';

const PACKAGE_ID = `0x${'1'.repeat(64)}`;
const NOTE_ID = `0x${'2'.repeat(64)}`;
const EVENT_TYPE = `${PACKAGE_ID}::product_note::ProductSubscribed`;

function subscribedNode(digest: string) {
  return {
    transaction: { digest },
    contents: {
      type: { repr: EVENT_TYPE },
      json: {
        registry_id: `0x${'9'.repeat(64)}`,
        note_id: NOTE_ID,
        owner: `0x${'a'.repeat(64)}`,
        product_kind: 0,
        wrapper_id: `0x${'3'.repeat(64)}`,
        oracle_id: `0x${'4'.repeat(64)}`,
        expiry_ms: '1783700000000',
        principal_amount: '100000000',
        fee_bps: '25',
        leg_count: '2',
        order_ids: ['11111', '22222'],
      },
    },
  };
}

function graphqlPage(nodes: unknown[], pageInfo: { hasNextPage: boolean; endCursor: string | null }) {
  return { data: { events: { pageInfo, nodes } } };
}

describe('createGraphqlProductNoteEventClient', () => {
  it('queries the events connection with type filter, cursor, and a clamped page size', async () => {
    const query = vi.fn(async (_options: { query: string; variables: Record<string, unknown> }) =>
      graphqlPage([], { hasNextPage: false, endCursor: null }),
    );

    const client = createGraphqlProductNoteEventClient({ query });
    await client.listEvents({ eventType: EVENT_TYPE, cursor: 'cursor-1', limit: 100 });

    expect(query).toHaveBeenCalledTimes(1);
    const [options] = query.mock.calls[0];
    expect(options.query).toContain('events(first: $first, after: $after, filter: { type: $eventType })');
    expect(options.variables).toEqual({
      eventType: EVENT_TYPE,
      after: 'cursor-1',
      first: PRODUCT_NOTE_EVENT_PAGE_SIZE,
    });
  });

  it('maps GraphQL event nodes into the shape buildProductNoteEventIndex consumes', async () => {
    const query = vi.fn(async () =>
      graphqlPage([subscribedNode('BY5wJh4xhACzksPuyy5PFioLpDT4xG6SPxyqj1VU3Lwc')], {
        hasNextPage: false,
        endCursor: 'cursor-end',
      }),
    );

    const client = createGraphqlProductNoteEventClient({ query });
    const page = await client.listEvents({ eventType: EVENT_TYPE });

    expect(page.nextCursor).toBeNull();
    const index = buildProductNoteEventIndex(page.events);
    const entry = index.byNoteId[NOTE_ID];
    expect(entry?.subscriptionDigest).toBe('BY5wJh4xhACzksPuyy5PFioLpDT4xG6SPxyqj1VU3Lwc');
    expect(entry?.principalBaseUnits).toBe(100000000n);
    expect(entry?.expiryMs).toBe(1783700000000n);
    expect(entry?.orderIds).toEqual([11111n, 22222n]);
  });

  it('returns the endCursor while more pages remain', async () => {
    const query = vi.fn(async () =>
      graphqlPage([subscribedNode('digest-1')], { hasNextPage: true, endCursor: 'cursor-2' }),
    );

    const client = createGraphqlProductNoteEventClient({ query });
    const page = await client.listEvents({ eventType: EVENT_TYPE });

    expect(page.nextCursor).toBe('cursor-2');
    expect(page.events).toHaveLength(1);
  });

  it('throws when the GraphQL response reports errors', async () => {
    const query = vi.fn(async () => ({
      data: undefined,
      errors: [{ message: 'Page size is too large: 100 > 50' }],
    }));

    const client = createGraphqlProductNoteEventClient({ query });

    await expect(client.listEvents({ eventType: EVENT_TYPE })).rejects.toThrow(
      'Page size is too large',
    );
  });

  it('throws when the events connection is missing from the response', async () => {
    const query = vi.fn(async () => ({ data: {} }));

    const client = createGraphqlProductNoteEventClient({ query });

    await expect(client.listEvents({ eventType: EVENT_TYPE })).rejects.toThrow(
      'no events connection',
    );
  });
});
