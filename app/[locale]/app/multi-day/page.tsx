import { redirect } from 'next/navigation';
import { localizedPath, normalizeLocale } from '../../../../src/i18n';

/** The split multi-day page merged back into /app/dual-investment — keep old links alive. */
export default function Page({ params }: { params: { locale: string } }) {
  redirect(localizedPath(normalizeLocale(params.locale), '/app/dual-investment'));
}
