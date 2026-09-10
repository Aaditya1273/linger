import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { aggregateHeadlineStats } from '../recorder/aggregateHeadlineStats';
import { analyticsFixtureSamples } from '../recorder/analyticsFixtures';
import { buildEdgeTracks } from '../recorder/buildEdgeTracks';
import { AnalyticsPage } from './AnalyticsPage';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
      <div style={{ width: 800, height: 320 }}>{children}</div>
    ),
  };
});

const samples = analyticsFixtureSamples();
const fixtureLoad = {
  kind: 'ready' as const,
  usingFixture: true,
  stats: aggregateHeadlineStats(samples),
  edgeTracks: buildEdgeTracks(samples),
};

describe('AnalyticsPage', () => {
  it('renders the snapshot verdict band, supporting tiles, Edge chart, and methodology in English', () => {
    render(<AnalyticsPage locale="en" load={fixtureLoad} />);

    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: 'Products' })).getByRole('link', { name: 'Analytics' }),
    ).toHaveAttribute('href', '/en/analytics');

    // Hero-right chip reads Snapshot (ADR-0013) — never Live/Delayed. The
    // window-end timestamp renders twice: hero ticker + chart caption.
    expect(screen.getByText('Recorder')).toBeVisible();
    expect(screen.getByText('Snapshot')).toBeVisible();
    expect(screen.getAllByText(/Data through/)).toHaveLength(2);

    // The why-paused disclosure sits above the verdict.
    expect(screen.getByText(/Benchmark Recorder is paused/)).toBeVisible();

    // Verdict band: leading % as the hero figure, median Edge as the pill,
    // sample count + closed window as the support line.
    const stats = screen.getByLabelText('Headline statistics');
    expect(stats).toBeVisible();
    expect(within(stats).getByText('% of time leading')).toBeVisible();
    expect(within(stats).getByText('83.3%')).toBeVisible();
    expect(within(stats).getByText('+7.50 pts')).toBeVisible();
    expect(
      within(stats).getByText(/Across 6 live-source matched Samples between .+ and .+\./),
    ).toBeVisible();

    // Supporting tiles keep the credibility metrics with one-line hints; the
    // streak is anchored to the snapshot, not "current".
    expect(within(stats).getByText('Samples')).toBeVisible();
    expect(within(stats).getByText('6')).toBeVisible();
    expect(within(stats).getByText('Live-source matched only')).toBeVisible();
    expect(within(stats).getByText('Leading streak at snapshot')).toBeVisible();
    expect(within(stats).getByText('2')).toBeVisible();
    expect(within(stats).getByText('Consecutive Runs ahead of Binance')).toBeVisible();
    expect(within(stats).getByText('85.7%')).toBeVisible();
    expect(within(stats).getByText('Rows with a comparable Binance product')).toBeVisible();

    // Edge chart: the archive keeps rendering; every Track is Archived.
    expect(screen.getByRole('region', { name: 'Edge Track' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Edge over time' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Expiry Market' })).toBeVisible();
    expect(screen.getByText('Archived')).toBeVisible();
    expect(screen.getByText('Min–max across ladder rows')).toBeVisible();

    // Methodology renders as term/definition cards, closed with the sampling
    // window and the pause disclosure.
    expect(screen.getByRole('heading', { name: 'Methodology' })).toBeVisible();
    expect(screen.getByText('Sampling cadence')).toBeVisible();
    expect(screen.getByText(/Every 15 minutes/)).toBeVisible();
    expect(screen.getByText('Matching rule')).toBeVisible();
    expect(screen.getByText(/exceeds 50%/i)).toBeVisible();
    expect(screen.getByText('Fee basis')).toBeVisible();
    expect(screen.getByText(/net after protocol fee/i)).toBeVisible();
    expect(screen.getByText('Denominator')).toBeVisible();
    expect(screen.getByText(/Failed Runs record no Samples/i)).toBeVisible();
    expect(screen.getByText(/One Edge Track per Expiry Market/i)).toBeVisible();
    expect(screen.getByText('Recording paused')).toBeVisible();
    expect(screen.getByText(/no day shelf to sample/i)).toBeVisible();
    expect(screen.getByText('Sampling window')).toBeVisible();
    expect(screen.queryByText('Sample start date')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source repository' })).toHaveAttribute(
      'href',
      'https://github.com/cl-fi/AnkerProtocol',
    );

    // Closing CTA points at what is open now (hourly tenors) — the retired
    // "same comparison live" claim must be gone.
    expect(screen.getByRole('heading', { name: 'Hourly Dual Investment is open now' })).toBeVisible();
    expect(screen.queryByText(/runs the same comparison live/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Dual Investment' })).toHaveAttribute(
      'href',
      '/en/app/dual-investment',
    );
  });

  it('keeps the live grammar when the Recorder is not paused', () => {
    render(<AnalyticsPage locale="en" load={fixtureLoad} snapshot={false} />);

    expect(screen.getAllByText(/Last Run/)).toHaveLength(2);
    expect(screen.queryByText('Snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText(/Benchmark Recorder is paused/)).not.toBeInTheDocument();
    expect(screen.getByText(/Across 6 live-source matched Samples since/)).toBeVisible();
    expect(screen.getByText('Leading streak')).toBeVisible();
    expect(screen.getByText('Active', { selector: '.anker-badge' })).toBeVisible();
    expect(screen.getByText('Sample start date')).toBeVisible();
    expect(screen.queryByText('Recording paused')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "See today's Edge, rung by rung" })).toBeVisible();
  });

  it('opens the methodology bottom sheet from the phone nav row', () => {
    render(<AnalyticsPage locale="en" load={fixtureLoad} />);

    // The trigger is CSS-gated to phones; the inline grid serves desktop.
    fireEvent.click(screen.getByRole('button', { name: 'Methodology' }));
    const sheet = screen.getByRole('dialog', { name: 'Methodology' });
    expect(within(sheet).getByText('Sampling cadence')).toBeVisible();
    expect(within(sheet).getByRole('link', { name: 'Source repository' })).toBeVisible();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Methodology' })).not.toBeInTheDocument();
  });

  it('renders Chinese copy on the analytics route shell', () => {
    render(<AnalyticsPage locale="zh-CN" load={fixtureLoad} />);

    expect(screen.getByRole('heading', { name: '数据分析' })).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: '产品' })).getByRole('link', { name: '数据分析' }),
    ).toHaveAttribute('href', '/zh-CN/analytics');
    expect(within(screen.getByLabelText('头条统计')).getByText('领先时间占比')).toBeVisible();
    expect(screen.getAllByText(/数据截至/)).toHaveLength(2);
    expect(screen.getByText('快照')).toBeVisible();
    expect(screen.getByText(/基准记录器已暂停/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Edge 随时间变化' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '方法说明' })).toBeVisible();
    expect(screen.getByText('采样节奏')).toBeVisible();
    expect(screen.getByText(/每 15 分钟/)).toBeVisible();
    expect(screen.getByText(/50%/)).toBeVisible();
    expect(screen.getByRole('link', { name: '源代码仓库' })).toHaveAttribute(
      'href',
      'https://github.com/cl-fi/AnkerProtocol',
    );
    expect(screen.getByRole('link', { name: '前往双币投资' })).toHaveAttribute(
      'href',
      '/zh-CN/app/dual-investment',
    );
  });

  it('shows an unavailable notice when Samples cannot be loaded', () => {
    render(<AnalyticsPage locale="en" load={{ kind: 'unavailable', reason: 'not_configured' }} />);

    expect(
      screen.getByText(/Benchmark Samples are not available yet/i),
    ).toBeVisible();
    expect(screen.getByText(/No live-source matched Samples yet/i)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Methodology' })).toBeVisible();
  });
});
