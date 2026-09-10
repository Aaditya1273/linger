import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, isLocale } from './src/i18n/locales';
import { localizedPath } from './src/i18n/routes';

const LEGACY_PATH_REDIRECTS: Record<string, string> = {
  '/': '/',
  '/app': '/app',
  '/app/dual-investment': '/app/dual-investment',
  '/app/portfolio': '/app/portfolio',
  '/app/dashboard': '/app/portfolio',
  '/dual-investment': '/app/dual-investment',
  '/analytics': '/analytics',
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  if (isLocale(firstSegment)) return NextResponse.next();

  const target = LEGACY_PATH_REDIRECTS[pathname];
  if (!target) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = localizedPath(DEFAULT_LOCALE, target);
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/',
    '/app',
    '/app/dual-investment',
    '/app/portfolio',
    '/app/dashboard',
    '/dual-investment',
    '/analytics',
    '/:locale(en|zh-CN)/:path*',
  ],
};
