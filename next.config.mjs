/**
 * Playwright's webServer boots `next dev` with the deterministic-fixture env
 * (runtimeModes: isDeterministicE2E). Next inlines NEXT_PUBLIC_* vars as
 * constants into compiled bundles and persists them in the webpack cache under
 * distDir, so sharing `.next` between an e2e server and a normal dev server
 * poisons the dev server into fixture mode (day rows become 0xday… fixtures on
 * the $50 ladder). Keep e2e builds in their own dist dir.
 */
const isDeterministicE2E =
  process.env.ANKER_DETERMINISTIC_E2E === 'true' || process.env.ANKER_DETERMINISTIC_E2E === '1';

/**
 * The OG/Twitter image routes read these assets at request time with
 * readFileSync; Vercel's file tracing missed the font (runtime ENOENT), so pin
 * them into the function bundles explicitly.
 */
const OG_IMAGE_ASSETS = ['./public/anker-logo.png', './src/fonts/og/Fredoka-Bold.ttf'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * wagmi's connectors barrel pulls in @base-org/account -> @coinbase/cdp-sdk,
   * which imports @x402/* for a payments feature this app never touches. Those
   * are optional peers and are not installed, so webpack cannot resolve them.
   * Aliasing to false keeps the unused branch out of the bundle instead of
   * installing a payments SDK we do not use.
   */
  webpack: (config, { webpack }) => {
    // Ignore the whole @x402/* family rather than aliasing each entry point:
    // the SDK reaches for several and the exact set changes between versions.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));
    return config;
  },
  distDir: isDeterministicE2E ? '.next-e2e' : '.next',
  experimental: {
    outputFileTracingIncludes: {
      '/opengraph-image': OG_IMAGE_ASSETS,
      '/twitter-image': OG_IMAGE_ASSETS,
    },
  },
  /**
   * `/` carries no locale, so it redirects to the default one. `/:locale` is
   * now the LANDING page rather than the ladder: the app itself is behind a
   * wallet connection, so an unauthenticated visitor needs somewhere to land.
   * Kept in config rather than a page because a prerendered `redirect()` emits
   * a 307 with no Location header, which curl and some crawlers cannot follow.
   */
  async redirects() {
    return [{ source: '/', destination: '/en', permanent: false }];
  },
};

export default nextConfig;
