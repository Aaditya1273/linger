import { readFileSync } from 'fs';
import { join } from 'path';
import { ImageResponse } from 'next/og';

export const alt = 'Anker Protocol — Drop anchor on your yield.';
/** Industry standard for OG + X summary_large_image (≈1.91:1). */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Asset reads stay inside the render path and fail soft. Next executes this
 * module while resolving every page's metadata, so a module-scope read that
 * throws (Vercel file tracing shipped the lambda without the font — ENOENT)
 * 500s every dynamically rendered page, not just this image route.
 * next.config.mjs pins these files into the bundle via
 * outputFileTracingIncludes; the fallbacks keep rendering even without them.
 */
function loadLogoSrc(): string | null {
  try {
    return `data:image/png;base64,${readFileSync(
      join(process.cwd(), 'public', 'anker-logo.png'),
    ).toString('base64')}`;
  } catch {
    return null;
  }
}

// TTF only — @vercel/og / Satori rejects wOF2.
function loadFredokaBold(): Buffer | null {
  try {
    return readFileSync(join(process.cwd(), 'src', 'fonts', 'og', 'Fredoka-Bold.ttf'));
  } catch {
    return null;
  }
}

/** Brand tokens mirrored from src/styles.css cartoon palette */
const C = {
  cream: '#f8f0df',
  cream2: '#f1e6ce',
  paper2: '#faf4ea',
  navy: '#20304d',
  gold: '#eb9b2d',
} as const;

/**
 * Logo-forward social card on the industry-standard 1200×630 canvas.
 *
 * Square assets are fine for app icons / summary cards, but X
 * `summary_large_image` and Facebook/LinkedIn OG all expect ~1.91:1.
 * A square source gets letterboxed or center-cropped — logo looks smaller.
 * Instead: keep 1200×630 and make the mark dominate the frame.
 */
export default function OpengraphImage() {
  const logoSrc = loadLogoSrc();
  const fredokaBold = loadFredokaBold();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          background: `radial-gradient(120% 90% at 50% -10%, ${C.paper2} 0%, ${C.cream} 55%, ${C.cream2} 100%)`,
          fontFamily: 'Fredoka',
        }}
      >
        {/* Soft ambient washes — keep edges warm without stealing focus */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -100,
            width: 520,
            height: 520,
            borderRadius: 999,
            background: 'rgba(235, 155, 45, 0.16)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -160,
            left: -120,
            width: 480,
            height: 480,
            borderRadius: 999,
            background: 'rgba(32, 48, 77, 0.06)',
            display: 'flex',
          }}
        />

        {/*
          Sticker tile ~420px on a 630px canvas → logo occupies most of the
          vertical space so timeline/thumbnail crops still read as the mark.
        */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 420,
            height: 420,
            borderRadius: 44,
            border: `5px solid ${C.navy}`,
            background: C.cream,
            boxShadow: `10px 10px 0 ${C.navy}`,
          }}
        >
          {logoSrc ? <img src={logoSrc} width={340} height={340} alt="" /> : null}
        </div>

        {/* Compact wordmark under the tile — secondary to the mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 28,
            color: C.navy,
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: -0.6,
            lineHeight: 1,
          }}
        >
          Anker Protocol
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 12,
            width: 64,
            height: 5,
            borderRadius: 999,
            background: C.gold,
          }}
        />
      </div>
    ),
    {
      ...size,
      // Without the brand font Satori falls back to its bundled default.
      ...(fredokaBold ? { fonts: [{ name: 'Fredoka', data: fredokaBold, weight: 700, style: 'normal' }] } : {}),
    },
  );
}
