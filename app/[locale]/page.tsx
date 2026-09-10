import { redirect } from 'next/navigation';
import { localizedPath, normalizeLocale } from '../../src/i18n';

/** The product is the landing: the root routes straight to the live ladder. */
export default function Page({ params }: { params: { locale: string } }) {
  redirect(localizedPath(normalizeLocale(params.locale), '/app/dual-investment'));
}
