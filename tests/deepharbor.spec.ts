import { expect, type Locator, type Page, test } from '@playwright/test';

async function expectDualInvestmentWorkspace(page: Page) {
  await expect(page.locator('main#dual-investment')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dual Investment' })).toBeVisible();

  const market = page.getByRole('region', { name: 'Choose your market' });
  await expect(market).toBeVisible();
  await expect(market.getByRole('link', { name: 'Buy Low' })).toBeVisible();
  await expect(market.getByRole('button', { name: 'Sell High' })).toHaveAttribute('aria-disabled', 'true');

  // One accessible settlement picker: desktop opens an anchored listbox and
  // phones open the same choices in a bottom sheet.
  const settlementDate = market.getByRole('button', { name: 'Settlement date' });
  await expect(settlementDate).toBeVisible();
  await expect(settlementDate).toHaveAttribute('aria-haspopup', 'listbox');
  await settlementDate.click();

  const settlementOptions = page.getByRole('listbox', { name: 'Settlement date' });
  await expect(settlementOptions).toBeVisible();
  await expect(settlementOptions.getByRole('group', { name: 'Days' })).toBeVisible();
  await expect(settlementOptions.getByRole('group', { name: 'Hours — tradable now' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settlementOptions).toBeHidden();

  // Day-scale copy vs sub-day yield copy — `isSubDayTenor` is wall-clock based, so a
  // default day snapshot sitting on the 24h boundary can render either branch.
  const reference = page.getByRole('region', { name: /^(APR reference|Per-period yield)$/ });
  const ladderTrigger = page.getByRole('button', { name: /^Yield by price/ });
  if (await ladderTrigger.isVisible().catch(() => false)) {
    await expect(ladderTrigger).toHaveAttribute('aria-haspopup', 'dialog');
  } else {
    await expect(reference.getByRole('heading', { name: /^Price & (APR|yield) reference$/ })).toBeVisible();
    await expect(reference.getByRole('button', { name: 'Refresh' })).toBeVisible();
  }

  await expect(page.getByRole('region', { name: 'Set your Buy Low' })).toBeVisible();
}

async function waitForReferenceRows(page: Page) {
  const ladderTrigger = page.getByRole('button', { name: /^Yield by price/ });
  if (await ladderTrigger.isVisible().catch(() => false)) await ladderTrigger.click();
  await expect(page.getByRole('region', { name: /^(APR reference|Per-period yield)$/ })).toBeVisible();
  const rows = page.locator('.di-reference-table tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThan(1);
  return rows;
}

test('root redirects straight to the Dual Investment workspace', async ({ page }) => {
  // Allow a long URL wait — CI cold-compiles the workspace under parallel workers.
  await page.goto('/');
  await page.waitForURL(/\/en\/app\/dual-investment\/?$/, { timeout: 30_000 });
  await expectDualInvestmentWorkspace(page);

  await page.goto('/zh-CN');
  await page.waitForURL(/\/zh-CN\/app\/dual-investment\/?$/, { timeout: 30_000 });
});

test('renders the Dual Investment market controls and quote reference table', async ({ page }) => {
  await page.goto('/app/dual-investment');

  await expectDualInvestmentWorkspace(page);
  const rows = await waitForReferenceRows(page);
  await expect(rows.first()).toContainText('below');
  await expect(rows.first()).toContainText('%');
});

test('supports selecting a Buy Low reference row and changing payoff smoothness', async ({ page }) => {
  await page.goto('/app/dual-investment');
  await expectDualInvestmentWorkspace(page);

  const rows = await waitForReferenceRows(page);
  const selectedPrice = (await rows.nth(1).locator('strong').first().textContent())?.replace(/[$,]/g, '');
  expect(selectedPrice).toBeTruthy();
  await rows.nth(1).click();

  const controls = page.getByRole('region', { name: 'Set your Buy Low' });
  await expect(controls.getByRole('spinbutton', { name: /Buy Low price/ })).toHaveValue(
    selectedPrice!,
  );
  await expect(controls.getByRole('spinbutton', { name: /Amount/ })).not.toHaveValue('0');

  const mobileSubscribe = page.getByRole('button', { name: 'Subscribe', exact: true });
  if (await mobileSubscribe.isVisible().catch(() => false)) {
    await mobileSubscribe.click();
    const confirmSheet = page.getByRole('dialog', { name: 'Confirm your Buy Low' });
    await expect(confirmSheet.getByRole('heading', { name: /What you'll receive on/ })).toBeVisible();
    await expect(confirmSheet.getByRole('region', { name: 'Confirm your Buy Low' })).toBeVisible();
    await confirmSheet.getByRole('button', { name: 'Close' }).click();
  } else {
    await expect(page.getByRole('heading', { name: /What you'll receive on/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Confirm your Buy Low' })).toBeVisible();
  }

  const advancedSheetTrigger = page.getByRole('button', { name: /^Advanced details/ });
  let advanced: Locator;
  if (await advancedSheetTrigger.isVisible().catch(() => false)) {
    await advancedSheetTrigger.click();
    advanced = page.getByRole('dialog', { name: 'Advanced details' });
    await expect(advanced).toBeVisible();
  } else {
    await page.getByText('Advanced details', { exact: true }).click();
    advanced = page.locator('main#dual-investment');
  }
  const smoothness = advanced.getByRole('combobox', { name: 'Payoff smoothness' });
  await smoothness.selectOption('9');
  await expect(smoothness).toHaveValue('9');
  await expect(advanced.getByRole('heading', { name: 'DeepBook Predict Legs' })).toBeVisible();
  const showLegs = advanced.getByRole('button', { name: /Show legs/ });
  if (await showLegs.isVisible().catch(() => false)) await showLegs.click();
  await expect(advanced.getByText('dUSDC payout').first()).toBeVisible();
});

test('renders the wallet portfolio entry point when disconnected', async ({ page }) => {
  await page.goto('/app/portfolio');

  await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
  await expect(page.locator('main#wallet-portfolio')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Products' }).getByRole('link', { name: 'Portfolio' })).toBeVisible();
  await expect(page.getByText('Connect your wallet to see your assets and positions.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect' }).first()).toBeVisible();
});

test('redirects legacy dashboard paths to the portfolio route in both locales', async ({ page }) => {
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();

  await page.goto('/en/app/dashboard');
  await expect(page).toHaveURL(/\/en\/app\/portfolio$/);

  await page.goto('/zh-CN/app/dashboard');
  await expect(page).toHaveURL(/\/zh-CN\/app\/portfolio$/);
  await expect(page.getByRole('heading', { name: '持仓' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '产品' }).getByRole('link', { name: '持仓' })).toBeVisible();
});

test('renders the Analytics page with fixture headline stats, Edge chart, and methodology', async ({
  page,
}) => {
  await page.goto('/analytics');

  await expect(page).toHaveURL(/\/en\/analytics$/);
  await expect(page.locator('main#benchmark-analytics')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Products' }).getByRole('link', { name: 'Analytics' })).toBeVisible();

  // Snapshot mode (ADR-0013): the Recorder chip reads Snapshot, and the
  // why-paused disclosure precedes the verdict.
  await expect(page.getByText('Snapshot', { exact: true })).toBeVisible();
  await expect(page.getByText(/Benchmark Recorder is paused/)).toBeVisible();

  const stats = page.getByLabel('Headline statistics');
  await expect(stats).toBeVisible();
  await expect(stats.getByText('Samples', { exact: true })).toBeVisible();
  await expect(stats.getByText('6', { exact: true })).toBeVisible();
  await expect(stats.getByText('83.3%')).toBeVisible();
  await expect(stats.getByText('+7.50 pts')).toBeVisible();
  await expect(stats.locator('.analytics-stats > div').filter({ hasText: 'Leading streak' })).toContainText(
    '2',
  );
  await expect(stats.getByText('Runs', { exact: true })).toBeVisible();
  await expect(stats.getByText('85.7%')).toBeVisible();

  const chart = page.getByRole('region', { name: 'Edge Track' });
  await expect(chart).toBeVisible();
  await expect(chart.getByRole('heading', { name: 'Edge over time' })).toBeVisible();
  await expect(chart.getByTestId('analytics-edge-chart')).toBeVisible();

  // Market picker defaults to the freshest-data market (Jul 16 · ≈3d); in
  // snapshot mode every Track wears the Archived badge.
  const marketSelect = chart.getByRole('button', { name: 'Expiry Market' });
  await expect(marketSelect).toBeVisible();
  await expect(marketSelect).toContainText('≈3d');
  await expect(chart.getByText('Archived', { exact: true })).toBeVisible();

  // Selected-market summary strip: 4 rows, all leading, median +7.50 pts.
  const summary = chart.getByTestId('analytics-track-summary');
  await expect(summary.getByText('4', { exact: true })).toBeVisible();
  await expect(summary.getByText('100%')).toBeVisible();
  await expect(summary.getByText('+7.50 pts')).toBeVisible();

  // Zero axis stays in frame; the Track band sits above it.
  await expect(chart.getByText('0.00 pts', { exact: true })).toBeVisible();

  // Hover the chart to surface the aggregated per-Run tooltip (no settlement offset).
  await chart.getByTestId('analytics-edge-chart').hover();
  const tooltip = chart.locator('.analytics-edge-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByText(/ladder rows/)).toBeVisible();
  await expect(tooltip.getByText('Median Edge')).toBeVisible();
  await expect(tooltip.getByText('Min–max')).toBeVisible();
  await expect(tooltip.getByText('Anker net APR')).toBeVisible();
  await expect(tooltip.getByText('Nearest-expiry Binance APR')).toBeVisible();
  await expect(tooltip.getByText('Settlement offset')).toHaveCount(0);

  // Switching to the 1d market (one matched Run) shows the insufficient
  // notice; the snapshot picker keeps a single flat archive group.
  await marketSelect.click();
  const marketListbox = page.getByRole('listbox', { name: 'Expiry Market' });
  const archiveGroup = marketListbox.getByRole('group', { name: 'Recorded markets' });
  await expect(archiveGroup.getByRole('option')).toHaveCount(3);
  await archiveGroup.getByRole('option').filter({ hasText: '≈1d' }).click();
  await expect(marketListbox).toBeHidden();
  await expect(chart.getByText('Archived', { exact: true })).toBeVisible();
  await expect(chart.getByText(/appears after two matched Runs/)).toBeVisible();
  await expect(chart.getByTestId('analytics-edge-chart')).toHaveCount(0);

  // Desktop shows the definition grid inline; phones tuck it behind a nav row
  // that opens a bottom sheet (the hidden heading can't name the region there,
  // so the phone branch scopes to the dialog instead).
  const methodologyTrigger = page.getByRole('button', { name: 'Methodology' });
  let definitions;
  if (await methodologyTrigger.isVisible()) {
    await methodologyTrigger.click();
    definitions = page.getByRole('dialog', { name: 'Methodology' });
  } else {
    definitions = page.getByRole('region', { name: 'Methodology' });
  }
  await expect(definitions).toBeVisible();
  await expect(definitions.getByText(/every 15 minutes/i)).toBeVisible();
  await expect(definitions.getByText(/exceeds 50%/i)).toBeVisible();
  await expect(definitions.getByText(/net after protocol fee/i)).toBeVisible();
  await expect(definitions.getByText(/live-source matched Samples/i)).toBeVisible();
  await expect(definitions.getByText(/Failed Runs record no Samples/i)).toBeVisible();
  await expect(definitions.getByText('Recording paused', { exact: true })).toBeVisible();
  await expect(definitions.getByText('Sampling window', { exact: true })).toBeVisible();
  await expect(definitions.getByRole('link', { name: 'Source repository' })).toHaveAttribute(
    'href',
    'https://github.com/cl-fi/AnkerProtocol',
  );
});

test('renders Chinese Analytics copy in fixture mode', async ({ page }) => {
  await page.goto('/zh-CN/analytics');

  await expect(page).toHaveURL(/\/zh-CN\/analytics$/);
  await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edge 随时间变化' })).toBeVisible();
  // Desktop names the section with its heading; phones show the sheet nav row.
  await expect(
    page.getByRole('heading', { name: '方法说明' }).or(page.getByRole('button', { name: '方法说明' })).first(),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: '产品' }).getByRole('link', { name: '数据分析' })).toBeVisible();
});

test('normalizes legacy and disabled Sell High routes to the Buy Low workspace', async ({ page }) => {
  await page.goto('/app/dual-investment?mode=target-sale');
  await expect(page).toHaveURL(/\/app\/dual-investment$/);
  await expectDualInvestmentWorkspace(page);

  await page.goto('/dual-investment?mode=target-sale');
  await expect(page).toHaveURL(/\/app\/dual-investment$/);
  await expectDualInvestmentWorkspace(page);
});

test('redirects the retired multi-day route to the merged Dual Investment page', async ({ page }) => {
  await page.goto('/en/app/multi-day');
  await expect(page).toHaveURL(/\/en\/app\/dual-investment$/);
  await expectDualInvestmentWorkspace(page);
});
