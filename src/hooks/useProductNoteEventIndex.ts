import { useQuery } from '@tanstack/react-query';
import { DEFAULT_ANKER_CONFIG } from '../sui/ankerTransactions';
import {
  buildProductNoteEventIndex,
  productNoteEventTypes,
  type ProductNoteEventClient,
  type ProductNoteEventIndex,
} from '../sui/productNoteEvents';
import { graphqlProductNoteEventClient } from '../sui/productNoteEventsGraphql';

function configuredPackageId(packageId: string) {
  return packageId.length > 0 && packageId !== '0x0';
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}

export function filterProductNoteEventIndex(index: ProductNoteEventIndex, noteIds: readonly string[]) {
  const byNoteId: ProductNoteEventIndex['byNoteId'] = {};
  const byOwner: ProductNoteEventIndex['byOwner'] = {};
  const byWrapperId: ProductNoteEventIndex['byWrapperId'] = {};

  for (const noteId of noteIds) {
    const entry = index.byNoteId[noteId];
    if (!entry) continue;
    byNoteId[noteId] = entry;
    if (entry.owner) {
      byOwner[entry.owner] ??= [];
      pushUnique(byOwner[entry.owner], noteId);
    }
    if (entry.wrapperId) {
      byWrapperId[entry.wrapperId] ??= [];
      pushUnique(byWrapperId[entry.wrapperId], noteId);
    }
  }

  return { byNoteId, byOwner, byWrapperId };
}

export async function fetchProductNoteEventIndex(client: ProductNoteEventClient, originalPackageId: string) {
  const eventsByType = await Promise.all(
    productNoteEventTypes(originalPackageId).map(async (eventType) => {
      const events: unknown[] = [];
      let cursor: string | null = null;

      do {
        const page = await client.listEvents({ eventType, cursor });
        events.push(...page.events);
        cursor = page.nextCursor;
      } while (cursor);

      return events;
    }),
  );

  return buildProductNoteEventIndex(eventsByType.flat());
}

export function useProductNoteEventIndex(
  noteIds: readonly string[] | undefined,
  originalPackageId = DEFAULT_ANKER_CONFIG.originalPackageId,
  client: ProductNoteEventClient = graphqlProductNoteEventClient,
) {
  const sortedNoteIds = [...(noteIds ?? [])].sort();

  return useQuery({
    queryKey: ['product-note-event-index', originalPackageId, sortedNoteIds],
    queryFn: async () =>
      filterProductNoteEventIndex(await fetchProductNoteEventIndex(client, originalPackageId), sortedNoteIds),
    enabled: configuredPackageId(originalPackageId) && sortedNoteIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
