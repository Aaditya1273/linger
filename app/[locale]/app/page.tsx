import { DualInvestmentPage } from '../../../src/components/DualInvestmentPage';
import { normalizeLocale } from '../../../src/i18n';

export default function Page({ params }: { params: { locale: string } }) {
  return <DualInvestmentPage locale={normalizeLocale(params.locale)} />;
}
