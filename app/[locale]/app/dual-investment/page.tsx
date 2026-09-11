import { BuyLowPage } from '../../../../src/components/BuyLowPage';
import { WalletGate } from '../../../../src/components/WalletGate';
import { normalizeLocale } from '../../../../src/i18n';

export default function Page({ params }: { params: { locale: string } }) {
  const locale = normalizeLocale(params.locale);
  return (
    <>
      <WalletGate locale={locale} mode="app" />
      <BuyLowPage locale={locale} />
    </>
  );
}
