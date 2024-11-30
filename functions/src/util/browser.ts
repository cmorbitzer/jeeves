import { Response } from 'firebase-functions/lib/v1/cloud-functions';
import * as logger from 'firebase-functions/logger';
import * as fs from 'fs';
import {
  chromium as playwright,
  Browser,
  BrowserContext,
  Page,
  Download,
} from 'playwright';

export const withBrowser = async (
  callback: ({
    browser,
    context,
    page,
  }: {
    browser: Browser;
    context: BrowserContext;
    page: Page;
  }) => void | Promise<void>,
) => {
  const chromium =
    process.env.NODE_ENV === 'production'
      ? require('@sparticuz/chromium')
      : undefined;

  const browser = await playwright.launch(
    chromium
      ? {
          executablePath: await chromium.executablePath(),
          args: chromium.args,
          headless: true,
        }
      : {},
  );

  logger.debug('Launched browser');

  const context = await browser.newContext();
  const page = await context.newPage();

  await callback({ browser, context, page });

  await context.close();
  await browser.close();
};

export const pipePdfDownloadToResponse = async (
  download: Download,
  response: Response,
) => {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename=${download.suggestedFilename()}`,
  );

  fs.createReadStream(await download.path()).pipe(response);

  logger.debug('Download piped to response');
};
