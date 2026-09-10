'use client';

import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';
import { DEEPBOOK_PREDICT } from '../config/deepbook';
import {
  fetchAccountWrapper,
  fetchAccountWrapperBalance,
  type AccountWrapperBalance,
  type AccountWrapperRecord,
} from '../sui/accountWrapper';

export type AccountWrapperQueryResult = AccountWrapperRecord & { wrapperId: string };

export function useAccountWrapper() {
  const account = useCurrentAccount();
  const client = useCurrentClient();

  return useQuery<AccountWrapperQueryResult>({
    queryKey: ['account-wrapper', account?.address, DEEPBOOK_PREDICT.accountRegistryId],
    enabled: Boolean(account?.address),
    queryFn: async () =>
      fetchAccountWrapper({
        client,
        owner: account!.address,
        accountPackageId: DEEPBOOK_PREDICT.accountPackageId,
        accountRegistryId: DEEPBOOK_PREDICT.accountRegistryId,
      }),
  });
}

export function useAccountWrapperBalance(wrapperId?: string) {
  const client = useCurrentClient();

  return useQuery<AccountWrapperBalance>({
    queryKey: [
      'account-wrapper-balance',
      wrapperId,
      DEEPBOOK_PREDICT.quoteAssetType,
      DEEPBOOK_PREDICT.accountPackageId,
    ],
    enabled: Boolean(wrapperId),
    queryFn: async () =>
      fetchAccountWrapperBalance({
        client,
        wrapperId: wrapperId!,
        accountPackageId: DEEPBOOK_PREDICT.accountPackageId,
        quoteAssetType: DEEPBOOK_PREDICT.quoteAssetType,
        quoteAssetDecimals: DEEPBOOK_PREDICT.quoteAssetDecimals,
      }),
  });
}
