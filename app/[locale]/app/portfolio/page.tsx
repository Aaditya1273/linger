import { PortfolioPage } from '../../../../src/components/PortfolioPage';
import { normalizeLocale } from '../../../../src/i18n';

export default function Page({ params }: { params: { locale: string } }) {
  return <PortfolioPage locale={normalizeLocale(params.locale)} />;
}
