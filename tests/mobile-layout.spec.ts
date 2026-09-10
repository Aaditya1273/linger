import { expect, type Page, test } from '@playwright/test';

const phoneWidths = [320, 430, 767] as const;
const routes = [
  { path: '/en/app/dual-investment', active: 'Dual Investment' },
  { path: '/en/app/portfolio', active: 'Portfolio' },
  { path: '/en/analytics', active: 'Analytics' },
] as const;
const chineseRoutes = [
  { path: '/zh-CN/app/dual-investment', active: '双币赢' },
  { path: '/zh-CN/app/portfolio', active: '持仓' },
  { path: '/zh-CN/analytics', active: '数据分析' },
] as const;

async function gotoReady(page: Page, path: string) {
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('ERR_ABORTED')) throw error;
    await page.goto(path, { waitUntil: 'domcontentloaded' });
  }
  await expect(page.locator('main')).toBeVisible();
}

async function expectPhoneChrome(page: Page, active: string) {
  const layout = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.top-nav');
    const nav = document.querySelector<HTMLElement>('.product-nav');
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      headerHeight: header?.getBoundingClientRect().height ?? 0,
      navPosition: nav ? getComputedStyle(nav).position : '',
      navBottom: nav ? Math.round(window.innerHeight - nav.getBoundingClientRect().bottom) : -1,
    };
  });

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.headerHeight).toBeLessThanOrEqual(62);
  expect(layout.navPosition).toBe('fixed');
  expect(layout.navBottom).toBeGreaterThanOrEqual(10);

  const navigation = page.locator('.product-nav');
  await expect(navigation.getByRole('link', { name: active })).toHaveAttribute('aria-current', 'page');
}

test.describe('phone layout', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Phone-only acceptance coverage.');
  });

  for (const width of phoneWidths) {
    test(`${width}px keeps all application pages inside the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      for (const route of routes) {
        await gotoReady(page, route.path);
        await expectPhoneChrome(page, route.active);
      }
    });
  }

  test('bottom navigation changes pages and preserves its active state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/app/dual-investment');

    const navigation = page.getByRole('navigation', { name: 'Products' });
    await navigation.getByRole('link', { name: 'Portfolio' }).click();
    await expect(page).toHaveURL(/\/en\/app\/portfolio$/);
    await expect(navigation.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');

    await navigation.getByRole('link', { name: 'Analytics' }).click();
    await expect(page).toHaveURL(/\/en\/analytics$/);
    await expect(navigation.getByRole('link', { name: 'Analytics' })).toHaveAttribute('aria-current', 'page');
  });

  for (const width of phoneWidths) {
    test(`${width}px wallet entry routes Dual Investment and Analytics users to Portfolio`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      for (const sourcePath of ['/en/app/dual-investment', '/en/analytics']) {
        await gotoReady(page, sourcePath);
        const walletEntry = page.locator('.top-nav').getByRole('link', { name: 'View Portfolio' });
        await expect(walletEntry).toBeVisible();
        await expect(page.locator('.top-nav .desktop-wallet-entry')).toBeHidden();

        await walletEntry.click();
        await expect(page).toHaveURL(/\/en\/app\/portfolio#wallet-portfolio$/);
        await expect(page.locator('.portfolio-connect-empty').getByRole('button', { name: 'Connect' })).toBeVisible();
      }
    });
  }

  test('Chinese labels keep the 320px app bar and navigation inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    for (const route of chineseRoutes) {
      await gotoReady(page, route.path);
      await expectPhoneChrome(page, route.active);
    }
  });

  test('price ladder opens in a sheet and closes after choosing a price', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/app/dual-investment');

    const trigger = page.getByRole('button', { name: /^Yield by price/ });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await trigger.click();

    const sheet = page.getByRole('dialog', { name: /^Price & (APR|yield) reference$/ });
    await expect(sheet).toBeVisible();
    const rows = sheet.locator('.di-reference-table tbody tr');
    await expect(rows.nth(1)).toBeVisible({ timeout: 30_000 });
    const selectedPrice = (await rows.nth(1).locator('strong').first().textContent())?.replace(/[$,]/g, '');
    expect(selectedPrice).toBeTruthy();
    await rows.nth(1).click();

    await expect(sheet).toBeHidden();
    await expect(page.getByRole('spinbutton', { name: /Buy Low price/ })).toHaveValue(selectedPrice!);
  });

  test('settlement date remains an accessible touch target inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await gotoReady(page, '/en/app/dual-investment');

    const trigger = page.getByRole('button', { name: 'Settlement date' });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const box = await trigger.boundingBox();
    if (!box) throw new Error('Settlement date trigger is not measurable');
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox', { name: 'Settlement date' })).toBeVisible();
  });

  test('claimable position renders the compact row whose sheet carries the detail', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('http://127.0.0.1:4124');
    await expect(page.locator('main#portfolio-component-fixture')).toBeVisible();

    // A claimable row: two-line summary plus an inline Claim, no accordion.
    const row = page.locator('.di-position-compact');
    await expect(row).toBeVisible();
    const claimBox = await page.locator('.di-position-claim').boundingBox();
    if (!claimBox) throw new Error('Claim button is not measurable');
    expect(claimBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.di-position-toggle')).toHaveCount(0);

    // Tapping the row opens the bottom-sheet detail with the outcome fork.
    await row.click();
    const sheet = page.getByRole('dialog', { name: 'Details' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.di-outcome-fork')).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
  });

  /** Serves an SVI-complete hourly market so client pricing works offline.
      With this surface, the default scan target's premium floor lands at
      702 dUSDC (tte-insensitive: the binding leg sits at the money), so the
      suggested minimum is a stable 800. */
  async function mockHourlyOracleMarket(page: Page) {
    await page.route('**/api/oracles/*/market?*', async (route) => {
      const requestUrl = new URL(route.request().url());
      const oracleId = requestUrl.pathname.split('/').at(-2) ?? '0xoracle';
      const now = Date.now();
      await route.fulfill({
        json: {
          predictId: '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
          oracleId,
          underlyingAsset: 'BTC',
          expiryMs: now + 60 * 60_000,
          minStrike: 1,
          tickSize: 0.01,
          admissionTickSize: 1,
          status: 'active',
          spot: 63_960.99,
          forward: 63_961.48,
          spotTimestampMs: now - 1_000,
          sviTimestampMs: now - 1_000,
          serverLagSeconds: 1,
          svi: {
            a: 0.000018652,
            b: 0.001284769,
            rho: -0.709081279,
            m: -0.00188903,
            sigma: 0.001665076,
          },
          predictPricing: {
            baseSpread: 0.02,
            minSpread: 0.005,
            baseFee: 0.02,
            minFee: 0.005,
            utilizationMultiplier: 0,
            minAskPrice: 0.02,
            maxAskPrice: 0.99,
            vaultBalance: 0,
            vaultTotalMtm: 0,
            vaultUtilization: 0,
            ewmaPenaltyRate: 0,
          },
        },
      });
    });
  }

  async function selectFirstHourlyTenor(page: Page) {
    const settlement = page.getByRole('button', { name: 'Settlement date' });
    await settlement.click();
    const hourlyGroup = page.getByRole('group', { name: 'Hours — tradable now' });
    await expect(hourlyGroup).toBeVisible();
    await hourlyGroup.getByRole('option').first().click();
  }

  test('subscribe summary stays available and opens the confirmation sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockHourlyOracleMarket(page);
    await page.goto('/en/app/dual-investment');

    await selectFirstHourlyTenor(page);
    await page.getByRole('spinbutton', { name: /Amount/ }).fill('1000');

    const subscribe = page.getByRole('button', { name: 'Subscribe', exact: true });
    await expect(subscribe).toBeVisible({ timeout: 30_000 });
    await page.getByText(/©2026 Anker Protocol/).scrollIntoViewIfNeeded();
    await expect(subscribe).toBeVisible();

    await subscribe.click();
    const sheet = page.getByRole('dialog', { name: 'Confirm your Buy Low' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: /What you'll receive on/ })).toBeVisible();
    await expect(sheet.getByRole('region', { name: 'Confirm your Buy Low' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Connect' })).toBeVisible();
  });

  test('premium-floor minimum surfaces before subscribe: tenor switch auto-raises, typed amounts get a one-tap fix', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockHourlyOracleMarket(page);
    await page.goto('/en/app/dual-investment');

    // Switching to an hourly tenor is a selection event: the 500 default sits
    // under this market's ~702 floor, so the amount auto-raises with a notice.
    await selectFirstHourlyTenor(page);
    const amount = page.getByRole('spinbutton', { name: /Amount/ });
    await expect(amount).toHaveValue('800');
    await expect(page.getByText(/minimum of about 800 dUSDC/)).toBeVisible();

    // Typing below the floor is never rewritten mid-edit — instead the dock
    // swaps its yield line for the reason and its CTA for a one-tap fix,
    // before any Subscribe attempt. The Amount field gets the same fix inline.
    await amount.fill('300');
    const dockFix = page.getByRole('button', { name: 'Use 800', exact: true });
    await expect(dockFix).toBeVisible();
    await expect(page.getByText(/Needs about 800 dUSDC or more/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Subscribe', exact: true })).toHaveCount(0);
    await expect(page.getByText(/This price needs about 800 dUSDC or more/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use minimum' })).toBeVisible();

    // The one-tap fix fills the minimum and restores the normal commit dock.
    await dockFix.click();
    await expect(amount).toHaveValue('800');
    await expect(page.getByRole('button', { name: 'Subscribe', exact: true })).toBeVisible();
    await expect(page.getByText(/Needs about 800 dUSDC or more/)).toHaveCount(0);

    // Clicking a deeper ladder rung is also a selection event: its floor sits
    // above the current amount, so the amount auto-raises again. The exact
    // figure depends on the rung, so assert the raise, not the number.
    await page.getByRole('button', { name: /^Yield by price/ }).click();
    const sheet = page.getByRole('dialog', { name: /^Price & (APR|yield) reference$/ });
    await expect(sheet).toBeVisible();
    await sheet.locator('.di-reference-table tbody tr').last().click();
    await expect(sheet).toBeHidden();
    const raised = Number(await amount.inputValue());
    expect(raised).toBeGreaterThan(800);
    await expect(page.getByText(/minimum of about/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Subscribe', exact: true })).toBeVisible();
  });

  test('methodology opens as a keyboard-operable bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto('/en/analytics');

    // The phone layout hides the section heading, so the region has no
    // accessible name here — target the nav row directly.
    const trigger = page.getByRole('button', { name: 'Methodology' });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Enter');

    const sheet = page.getByRole('dialog', { name: 'Methodology' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Sampling cadence')).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
  });

  test('connect dialog is a scrollable bottom sheet inside the dynamic viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/en/app/portfolio');
    await page.locator('.portfolio-connect-empty').getByRole('button', { name: 'Connect' }).click();

    const dialog = page.getByRole('dialog', { name: 'Sign in' });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        dialog.evaluate((element) =>
          Math.abs(window.innerHeight - element.getBoundingClientRect().bottom),
        ),
      )
      .toBeLessThanOrEqual(1);
    const sheet = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottomGap: window.innerHeight - rect.bottom,
        left: rect.left,
        width: rect.width,
        viewportWidth: window.innerWidth,
        height: rect.height,
        viewportHeight: window.innerHeight,
        overflowY: getComputedStyle(element).overflowY,
      };
    });
    expect(Math.abs(sheet.bottomGap)).toBeLessThanOrEqual(1);
    expect(Math.abs(sheet.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(sheet.width - sheet.viewportWidth)).toBeLessThanOrEqual(1);
    expect(sheet.height).toBeLessThan(sheet.viewportHeight);
    expect(['auto', 'scroll']).toContain(sheet.overflowY);

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });
});

test('desktop keeps the existing header wallet dialog entry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Desktop-only compatibility coverage.');
  await page.setViewportSize({ width: 1024, height: 768 });
  await gotoReady(page, '/en/app/dual-investment');

  await expect(page.locator('.top-nav').getByRole('link', { name: 'View Portfolio' })).toBeHidden();
  const connect = page.locator('.top-nav').getByRole('button', { name: 'Connect' });
  await expect(connect).toBeVisible();
  await connect.click();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
});
