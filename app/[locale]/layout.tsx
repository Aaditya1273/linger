import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import '../globals.css';
import { Providers } from '../providers';
import { copyForLocale, isLocale, localizedPath, SUPPORTED_LOCALES, type Locale } from '../../src/i18n';

// Keep the display font independent of Google Fonts at dev/build time. This
// file is the same variable Latin asset used by the current production build.
const fredoka = localFont({
  src: '../../src/fonts/Fredoka-latin.woff2',
  weight: '300 700',
  variable: '--font-fredoka',
  display: 'swap',
});

const geistSans = localFont({
  src: '../../src/fonts/Geist.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
});

const geistMono = localFont({
  src: '../../src/fonts/GeistMono.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.ankerprotocol.xyz';

type LocaleParams = { locale: string };

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export function generateMetadata({ params }: { params: LocaleParams }): Metadata {
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const copy = copyForLocale(locale);
  const alternates = Object.fromEntries(
    SUPPORTED_LOCALES.map((nextLocale) => [nextLocale, localizedPath(nextLocale, '/')]),
  );

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: copy.common.brand,
      template: `%s · ${copy.common.brand}`,
    },
    description: copy.metadata.description,
    applicationName: copy.common.brand,
    icons: {
      icon: '/icon.png',
      apple: '/icon.png',
    },
    alternates: {
      canonical: localizedPath(locale, '/'),
      languages: alternates,
    },
    openGraph: {
      type: 'website',
      siteName: copy.common.brand,
      title: copy.common.brand,
      description: copy.metadata.description,
      locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.common.brand,
      description: copy.metadata.description,
    },
  };
}

export default function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LocaleParams;
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
