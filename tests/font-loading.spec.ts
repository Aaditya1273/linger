import { expect, test } from '@playwright/test';

test('renders the wordmark with Fredoka when Google Fonts is unavailable', async ({ page }) => {
  const fontResponseUrls: string[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'font') fontResponseUrls.push(response.url());
  });

  await page.goto('/en/app/dual-investment');

  const wordmark = page.getByText('Anker Protocol', { exact: true }).first();
  await expect(wordmark).toBeVisible();
  await wordmark.evaluate(async (element) => {
    await document.fonts.ready;
    element.setAttribute('data-font-probe', 'wordmark');
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const documentNode = await cdp.send('DOM.getDocument');
  const wordmarkNode = await cdp.send('DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector: '[data-font-probe="wordmark"]',
  });
  expect(wordmarkNode.nodeId).toBeTruthy();

  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', {
    nodeId: wordmarkNode.nodeId,
  });
  expect(
    fonts.some(
      (font) =>
        font.isCustomFont && /Fredoka/i.test(`${font.familyName} ${font.postScriptName}`),
    ),
  ).toBe(true);
  expect(fontResponseUrls).not.toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//),
    ]),
  );
});
