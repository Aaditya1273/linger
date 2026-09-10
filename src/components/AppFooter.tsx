import { copyForLocale, DEFAULT_LOCALE, type Locale } from '../i18n';
import { SocialLinks } from './SocialLinks';

export function AppFooter({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const copy = copyForLocale(locale);

  return (
    <footer className="app-footer">
      <span>{copy.common.copyright}</span>
      <SocialLinks locale={locale} />
    </footer>
  );
}
