'use client';

import '@rainbow-me/rainbowkit/styles.css';

import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { SOMNIA_CHAIN, wagmiConfig } from '../src/wallet/config';

/** Follow the OS theme so the wallet modal never fights the page around it. */
function usePrefersDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(query.matches);
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return dark;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Shannon markets live ~60s. A stale quote is worse than no quote, so
        // nothing market-derived is cached across a mount by default.
        defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const dark = usePrefersDark();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={SOMNIA_CHAIN}
          theme={
            dark
              ? darkTheme({ accentColor: '#4f7cff', borderRadius: 'medium' })
              : lightTheme({ accentColor: '#4f7cff', borderRadius: 'medium' })
          }
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
