import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SUI_GRPC_URL, SUI_NETWORK } from '../config/deepbook';
import { registerEnokiWalletsIfConfigured } from './enokiWallets';

const GRPC_URLS = {
  testnet: SUI_GRPC_URL,
} as const;

export const dAppKit = createDAppKit({
  networks: [SUI_NETWORK],
  defaultNetwork: SUI_NETWORK,
  createClient: (network) =>
    new SuiGrpcClient({
      network,
      baseUrl: GRPC_URLS[SUI_NETWORK],
      fetchInit: { cache: 'no-store' },
    }),
});

registerEnokiWalletsIfConfigured(dAppKit.getClient(SUI_NETWORK));

declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
