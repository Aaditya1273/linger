export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && LOCALE_SET.has(value));
}

export function normalizeLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeLabel(locale: Locale) {
  return locale === 'zh-CN' ? '中文' : 'English';
}

/** Compact label for the language-switcher trigger (current locale). */
export function localeShortLabel(locale: Locale) {
  return locale === 'zh-CN' ? '中' : 'EN';
}
