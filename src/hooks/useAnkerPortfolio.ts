'use client';

import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';
import {
  parseOwnedProductNotes,
  productNoteType,
  type AnkerProductNoteRecord,
} from '../sui/ankerPortfolio';
import { DEFAULT_ANKER_CONFIG, type AnkerProtocolConfig } from '../sui/ankerTransactions';

export function useAnkerPortfolio(config: AnkerProtocolConfig = DEFAULT_ANKER_CONFIG) {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const packageConfigured = config.originalPackageId !== '0x0' && config.originalPackageId.length > 0;

  return useQuery<AnkerProductNoteRecord[]>({
    queryKey: ['anker-portfolio', account?.address, config.originalPackageId],
    enabled: Boolean(account?.address) && packageConfigured,
    queryFn: async () => {
      const objects: unknown[] = [];
      let cursor: string | null | undefined;

      do {
        const page = await client.listOwnedObjects({
          owner: account!.address,
          type: productNoteType(config.originalPackageId),
          include: { json: true },
          cursor,
          limit: 50,
        });
        objects.push(...page.objects);
        cursor = page.hasNextPage ? page.cursor : null;
      } while (cursor);

      return parseOwnedProductNotes(objects, {
        originalPackageId: config.originalPackageId,
        quoteAssetDecimals: config.quoteAssetDecimals,
      });
    },
  });
}
