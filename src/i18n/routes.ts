import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';

function normalizePath(path: string) {
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function stripLocalePath(path: string) {
  const normalized = normalizePath(path);
  const [first, ...rest] = normalized.split('/').filter(Boolean);
  if (isLocale(first)) {
    return rest.length > 0 ? `/${rest.join('/')}` : '/';
  }
  return normalized;
}

export function localizedPath(locale: Locale, path: string) {
  const stripped = stripLocalePath(path);
  return stripped === '/' ? `/${locale}` : `/${locale}${stripped}`;
}

export function switchLocalePath(path: string, nextLocale: Locale) {
  return localizedPath(nextLocale, stripLocalePath(path));
}

export function defaultLocalizedPath(path: string) {
  return localizedPath(DEFAULT_LOCALE, path);
}
