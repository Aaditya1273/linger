import { Github } from 'lucide-react';
import { copyForLocale, DEFAULT_LOCALE, type Locale } from '../i18n';

/**
 * Repo link. Env-driven so a fork does not ship someone else's repository —
 * the Sui-era literal pointed at cl-fi/AnkerProtocol long after the port.
 */
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? 'https://github.com/Aaditya1273/linger';

const SOCIAL_LINKS = [
  {
    key: 'x',
    label: 'X',
    href: 'https://x.com/ankerprotocol',
    icon: <span className="social-x-mark" aria-hidden="true">𝕏</span>,
  },
  {
    key: 'github',
    label: 'GitHub',
    href: REPO_URL,
    icon: <Github size={17} aria-hidden="true" />,
  },
] as const;

export function SocialLinks({
  locale = DEFAULT_LOCALE,
  variant = 'footer',
}: {
  locale?: Locale;
  variant?: 'footer';
}) {
  const copy = copyForLocale(locale);

  return (
    <nav className="social-links footer-social-links" aria-label={copy.common.socialLinks}>
      <span className="social-icon-row">
        {SOCIAL_LINKS.map((link) => (
          <a href={link.href} target="_blank" rel="noreferrer" aria-label={link.label} title={link.label} key={link.key}>
            {link.icon}
          </a>
        ))}
      </span>
    </nav>
  );
}
