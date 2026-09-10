import { AnalyticsPage } from '../../../src/components/AnalyticsPage';
import { normalizeLocale } from '../../../src/i18n';
import { loadAnalyticsStats } from '../../../src/recorder/loadAnalyticsStats';

/**
 * ISR: without this the locale layout's generateStaticParams freezes the page
 * at build time, so it never picks up new 15-minute Recorder runs from Neon.
 */
export const revalidate = 60;

export default async function Page({ params }: { params: { locale: string } }) {
  const locale = normalizeLocale(params.locale);
  const load = await loadAnalyticsStats();
  return <AnalyticsPage locale={locale} load={load} />;
}
