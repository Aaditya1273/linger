import { redirect } from 'next/navigation';
import { localizedPath, normalizeLocale } from '../../../src/i18n';

export default function Page({ params }: { params: { locale: string } }) {
  redirect(localizedPath(normalizeLocale(params.locale), '/app/dual-investment'));
}
