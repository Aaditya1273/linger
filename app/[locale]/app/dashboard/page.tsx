import { redirect } from 'next/navigation';
import { localizedPath, normalizeLocale } from '../../../../src/i18n';

/** Holdings page renamed to Portfolio — keep old dashboard links alive. */
export default function Page({ params }: { params: { locale: string } }) {
  redirect(localizedPath(normalizeLocale(params.locale), '/app/portfolio'));
}
