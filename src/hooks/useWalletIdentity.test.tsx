import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWalletIdentity } from './useWalletIdentity';

const { currentWalletMock, isEnokiWalletMock, getSessionMock, getWalletMetadataMock } = vi.hoisted(() => ({
  currentWalletMock: vi.fn(),
  isEnokiWalletMock: vi.fn(),
  getSessionMock: vi.fn(),
  getWalletMetadataMock: vi.fn(),
}));

vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentWallet: () => currentWalletMock(),
}));

vi.mock('@mysten/enoki', () => ({
  isEnokiWallet: (wallet: unknown) => isEnokiWalletMock(wallet),
  getSession: (wallet: unknown) => getSessionMock(wallet),
  getWalletMetadata: (wallet: unknown) => getWalletMetadataMock(wallet),
}));

// A real Google ID-token layout: header.payload.signature, base64url payload,
// with the sub/iss/aud claims decodeJwt requires.
function jwtWithClaims(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = { iss: 'https://accounts.google.com', sub: '10769150350006150715113082367', aud: 'anker', ...claims };
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.sig`;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useWalletIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null while no wallet is connected', () => {
    currentWalletMock.mockReturnValue(null);
    const { result } = renderHook(() => useWalletIdentity(), { wrapper });
    expect(result.current).toBeNull();
  });

  it('resolves an Enoki wallet to the Google email from the session JWT', async () => {
    currentWalletMock.mockReturnValue({ name: 'Sign in with Google', icon: 'data:image/svg+xml;base64,' });
    isEnokiWalletMock.mockReturnValue(true);
    getWalletMetadataMock.mockReturnValue({ provider: 'google' });
    getSessionMock.mockResolvedValue({ jwt: jwtWithClaims({ email: 'anker@example.com' }) });

    const { result } = renderHook(() => useWalletIdentity(), { wrapper });

    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'social', provider: 'google', email: 'anker@example.com' }),
    );
  });

  it('keeps a null email for sessions signed in before the email scope existed', async () => {
    currentWalletMock.mockReturnValue({ name: 'Sign in with Google', icon: 'data:image/svg+xml;base64,' });
    isEnokiWalletMock.mockReturnValue(true);
    getWalletMetadataMock.mockReturnValue({ provider: 'google' });
    getSessionMock.mockResolvedValue({ jwt: jwtWithClaims({}) });

    const { result } = renderHook(() => useWalletIdentity(), { wrapper });

    await waitFor(() => expect(result.current).toEqual({ kind: 'social', provider: 'google', email: null }));
  });

  it('resolves an extension wallet to its own name and icon', () => {
    currentWalletMock.mockReturnValue({ name: 'Slush', icon: 'data:image/png;base64,abc' });
    isEnokiWalletMock.mockReturnValue(false);

    const { result } = renderHook(() => useWalletIdentity(), { wrapper });

    expect(result.current).toEqual({ kind: 'extension', name: 'Slush', icon: 'data:image/png;base64,abc' });
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
