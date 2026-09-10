import { PositionsPage } from '../../../../src/components/PositionsPage';
import { normalizeLocale } from '../../../../src/i18n';

export default function Page({ params }: { params: { locale: string } }) {
  return <PositionsPage locale={normalizeLocale(params.locale)} />;
}
