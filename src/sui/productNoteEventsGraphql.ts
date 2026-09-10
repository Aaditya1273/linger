import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SUI_GRAPHQL_URL, SUI_NETWORK } from '../config/deepbook';
import type { ProductNoteEventClient, ProductNoteEventPage } from './productNoteEvents';

/** The GraphQL RPC rejects event pages larger than 50. */
export const PRODUCT_NOTE_EVENT_PAGE_SIZE = 50;

const PRODUCT_NOTE_EVENTS_QUERY = /* GraphQL */ `
  query ProductNoteEvents($eventType: String!, $after: String, $first: Int!) {
    events(first: $first, after: $after, filter: { type: $eventType }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        transaction {
          digest
        }
        contents {
          type {
            repr
          }
          json
        }
      }
    }
  }
`;

type ProductNoteEventQueryClient = {
  query(options: {
    query: string;
    variables: Record<string, unknown>;
  }): Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string }> }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function indexableEvent(node: unknown) {
  if (!isRecord(node)) return node;
  const transaction = isRecord(node.transaction) ? node.transaction : undefined;
  const contents = isRecord(node.contents) ? node.contents : undefined;
  const contentsType = contents && isRecord(contents.type) ? contents.type : undefined;
  return {
    id: { txDigest: transaction?.digest },
    type: contentsType?.repr,
    parsedJson: contents?.json,
  };
}

let defaultQueryClient: ProductNoteEventQueryClient | undefined;

function graphqlQueryClient() {
  defaultQueryClient ??= new SuiGraphQLClient({ url: SUI_GRAPHQL_URL, network: SUI_NETWORK });
  return defaultQueryClient;
}

export function createGraphqlProductNoteEventClient(queryClient?: ProductNoteEventQueryClient): ProductNoteEventClient {
  return {
    async listEvents({ eventType, cursor, limit = PRODUCT_NOTE_EVENT_PAGE_SIZE }): Promise<ProductNoteEventPage> {
      const { data, errors } = await (queryClient ?? graphqlQueryClient()).query({
        query: PRODUCT_NOTE_EVENTS_QUERY,
        variables: {
          eventType,
          after: cursor ?? null,
          first: Math.min(limit, PRODUCT_NOTE_EVENT_PAGE_SIZE),
        },
      });

      if (errors?.length) {
        throw new Error(`Product note event query failed: ${errors.map((error) => error.message).join('; ')}`);
      }
      const connection = isRecord(data) ? data.events : undefined;
      if (!isRecord(connection)) {
        throw new Error('Product note event query returned no events connection');
      }

      const nodes = Array.isArray(connection.nodes) ? connection.nodes : [];
      const pageInfo = isRecord(connection.pageInfo) ? connection.pageInfo : undefined;
      const endCursor = typeof pageInfo?.endCursor === 'string' ? pageInfo.endCursor : null;

      return {
        events: nodes.map(indexableEvent),
        nextCursor: pageInfo?.hasNextPage === true ? endCursor : null,
      };
    },
  };
}

/** Default client for the product-note event index (D7: event queries go through GraphQL). */
export const graphqlProductNoteEventClient = createGraphqlProductNoteEventClient();
