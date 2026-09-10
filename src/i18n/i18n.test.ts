import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  formattersForLocale,
  isLocale,
  localeShortLabel,
  localizedPath,
  normalizeLocale,
  stripLocalePath,
  switchLocalePath,
  utcOffsetLabel,
} from './index';

describe('i18n locale helpers', () => {
  it('validates and normalizes supported locales', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('zh-CN')).toBe(true);
    expect(isLocale('ja-JP')).toBe(false);
    expect(normalizeLocale('ja-JP')).toBe(DEFAULT_LOCALE);
  });

  it('shortens locale labels for the language-switcher trigger', () => {
    expect(localeShortLabel('en')).toBe('EN');
    expect(localeShortLabel('zh-CN')).toBe('中');
  });

  it('adds, strips, and switches locale prefixes', () => {
    expect(localizedPath('en', '/app/portfolio')).toBe('/en/app/portfolio');
    expect(localizedPath('zh-CN', '/en/app/dual-investment')).toBe('/zh-CN/app/dual-investment');
    expect(stripLocalePath('/zh-CN/app/portfolio')).toBe('/app/portfolio');
    expect(switchLocalePath('/en/app/portfolio', 'zh-CN')).toBe('/zh-CN/app/portfolio');
  });

  it('uses USD symbols for price formatting in Chinese locale', () => {
    const format = formattersForLocale('zh-CN');

    expect(format.usd(65_000)).toBe('$65,000');
  });

  it('formats BTC amounts with at most six decimal places', () => {
    const format = formattersForLocale('en');

    expect(format.btcAmount(0.123456789)).toBe('0.123457');
    expect(format.btcAmount(0.00007634)).toBe('0.000076');
    expect(format.btcAmount(1.5)).toBe('1.5');
    expect(format.btcAmountCompact(0.00007634)).toBe('0.000076');
  });

  // Tests pin TZ=Asia/Shanghai (vitest.config.ts), so the viewer offset is UTC+8.
  it('annotates expiry and time labels with the viewer UTC offset', () => {
    const format = formattersForLocale('en');
    const settlementMs = Date.UTC(2026, 6, 16, 0, 0, 0); // Jul 16 00:00 UTC → Jul 16 08:00 local

    expect(utcOffsetLabel(settlementMs)).toBe('UTC+8');
    expect(format.expiry(settlementMs)).toMatch(/Jul 16, 08:00.*\(UTC\+8\)$/);
    expect(format.time(settlementMs)).toBe(format.expiry(settlementMs));
  });
});
