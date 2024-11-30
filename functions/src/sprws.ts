import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { chromium as playwright } from 'playwright';
import * as fs from 'fs';

if (process.env.NODE_ENV === 'production') {
  var chromium = require('@sparticuz/chromium');
}

export const downloadSPRWSStatement = onRequest(
  {
    cors: true,
    memory: '2GiB',
    timeoutSeconds: 120,
    secrets: ['SPRWS_USERNAME', 'SPRWS_PASSWORD'],
  },
  async (request, response) => {
    logger.info(request.query);

    const accountNumber = request.query.accountNumber as string;

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

    await page.goto('https://billpay.saintpaulwater.com/LinkLogin.aspx');
    await page.getByLabel('Username:').fill(process.env.SPRWS_USERNAME!);
    await page.getByLabel('Password:').fill(process.env.SPRWS_PASSWORD!);
    await page.locator('#dnn_ctr738_Login_Login_DNN_cmdLogin').click();
    await page.waitForURL('https://billpay.saintpaulwater.com/Home.aspx', {
      timeout: 10000,
    });
    logger.debug('Logged in');

    if (
      (await page.locator('#dnn_INFOPOPUP1_lblAcctNum').textContent()) !==
      accountNumber
    ) {
      logger.debug('Navigating to account');

      await page.getByRole('link', { name: 'List Accounts' }).click();
      logger.debug('Navigated to account list');

      await page.getByRole('link', { name: accountNumber }).click();
      logger.debug('Navigated to account');
    }

    await page.getByRole('link', { name: 'Billing History' }).click();
    logger.debug('Navigated to billing history');

    const downloadLinkLocator = page
      .locator('#dnn_ctr378_BillingHistory_GridView1')
      .getByRole('row')
      .nth(1)
      .getByRole('link', { name: 'View' });

    if (await downloadLinkLocator.count()) {
      const downloadPromise = page.waitForEvent('download');

      await downloadLinkLocator.click();
      logger.debug('Clicked download link');

      const download = await downloadPromise;
      const filePath = await download.path();

      if (fs.statSync(filePath).size < 1000) {
        response.status(500).send('Downloaded file is too small');
      } else {
        response.setHeader('Content-Type', 'application/pdf');
        response.setHeader(
          'Content-Disposition',
          `attachment; filename=${download.suggestedFilename()}`,
        );
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(response);

        logger.debug('Downloaded statement');
      }
    } else {
      response.status(404).send('No recent statement found');
    }

    await context.close();
    await browser.close();
  },
);
