import { redirect } from 'next/navigation';
import { DualInvestmentPage } from '../../../../src/components/DualInvestmentPage';
import { localizedPath, normalizeLocale } from '../../../../src/i18n';

export default function Page({ params, searchParams }: { params: { locale: string }; searchParams?: { mode?: string } }) {
  const locale = normalizeLocale(params.locale);
  if (searchParams?.mode) {
    redirect(localizedPath(locale, '/app/dual-investment'));
  }
  return <DualInvestmentPage locale={locale} />;
}
