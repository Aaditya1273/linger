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
  distDir: isDeterministicE2E ? '.next-e2e' : '.next',
  experimental: {
    outputFileTracingIncludes: {
      '/opengraph-image': OG_IMAGE_ASSETS,
      '/twitter-image': OG_IMAGE_ASSETS,
    },
  },
  /**
   * The product is the landing. Root redirects live here (not in a page):
   * a statically prerendered redirect() page emits a 307 with no Location
   * header, which curl and some crawlers cannot follow. Config redirects are
   * served from the routing layer before any rendering.
   */
  async redirects() {
    return [
      { source: '/', destination: '/en/app/dual-investment', permanent: false },
      { source: '/:locale(en|zh-CN)', destination: '/:locale/app/dual-investment', permanent: false },
    ];
  },
};

export default nextConfig;
