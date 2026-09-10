/**
 * Compatibility shim: PredictManager indexer lookups were removed with the 6-24 migration.
 * Returns the wallet's single AccountWrapper (when present) in the old `{ managerId }` shape
 * so dashboard / execution callers keep working until they migrate fully to useAccountWrapper.
 */
import { useAccountWrapper } from './useAccountWrapper';

export function usePredictManagers() {
  const wrapperQuery = useAccountWrapper();
  const wrapper = wrapperQuery.data;
  const data =
    wrapper?.exists && wrapper.wrapperId
      ? [{ managerId: wrapper.wrapperId, owner: wrapper.owner }]
      : [];

  return {
    data,
    isPending: wrapperQuery.isPending,
    isError: wrapperQuery.isError,
    error: wrapperQuery.error,
    refetch: async () => {
      const result = await wrapperQuery.refetch();
      const next = result.data;
      return {
        data:
          next?.exists && next.wrapperId
            ? [{ managerId: next.wrapperId, owner: next.owner }]
            : [],
      };
    },
  };
}
