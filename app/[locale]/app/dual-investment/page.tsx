import { BuyLowPage } from '../../../../src/components/BuyLowPage';
import { normalizeLocale } from '../../../../src/i18n';

export default function Page({ params }: { params: { locale: string } }) {
  return <BuyLowPage locale={normalizeLocale(params.locale)} />;
}
