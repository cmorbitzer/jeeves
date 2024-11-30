import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as fs from 'fs';
import { pipePdfDownloadToResponse, withBrowser } from './util/browser';

/**
 * Download the most recent Saint Paul Regional Water Services statement for the given account.
 *
 * @param accountNumber The account number to download the statement for.
 *
 * @requires SPRWS_USERNAME The username to log in to the SPRWS website.
 * @requires SPRWS_PASSWORD The password to log in to the SPRWS website.
 *
 * @returns The PDF file of the statement.
 */
export const downloadSprwsStatement = onRequest(
  {
    cors: true,
    memory: '2GiB',
    timeoutSeconds: 120,
    secrets: ['SPRWS_USERNAME', 'SPRWS_PASSWORD'],
  },
  async (request, response) => {
    logger.info(request.query);

    const accountNumber = request.query.accountNumber as string;

    await withBrowser(async ({ page }) => {
      // Navigate to the login page
      await page.goto('https://billpay.saintpaulwater.com/LinkLogin.aspx');

      // Fill in the login form
      await page.getByLabel('Username:').fill(process.env.SPRWS_USERNAME!);
      await page.getByLabel('Password:').fill(process.env.SPRWS_PASSWORD!);
      await page.locator('#dnn_ctr738_Login_Login_DNN_cmdLogin').click();

      // Wait for successful login and navigation to the home page, so the current account number can be checked below
      await page.waitForURL('https://billpay.saintpaulwater.com/Home.aspx', {
        timeout: 10000,
      });

      logger.debug('Logged in');

      // If the current account number is not the one requested, navigate to the requested account
      if (
        (await page.locator('#dnn_INFOPOPUP1_lblAcctNum').textContent()) !==
        accountNumber
      ) {
        logger.debug('Navigating to account');

        await page.getByRole('link', { name: 'List Accounts' }).click();
        logger.debug('Navigated to account list');

        await page.getByRole('link', { name: accountNumber }).click();
        logger.debug('Navigated to account');

        await page.getByRole('link', { name: 'Billing History' }).click();
        logger.debug('Navigated to billing history');
      }

      // Find the download link for the most recent billing period
      const downloadLinkLocator = page
        .locator('#dnn_ctr378_BillingHistory_GridView1')
        .getByRole('row')
        .nth(1)
        .getByRole('link', { name: 'View' });

      // If there is no download link for the most recent billing period, return a 404 response
      if (!(await downloadLinkLocator.count())) {
        response.status(404).send('No recent statement found');
        return;
      }

      const downloadPromise = page.waitForEvent('download');
      await downloadLinkLocator.click();
      logger.debug('Clicked download link');
      const download = await downloadPromise;

      // If the downloaded file is too small, there is a problem with the eBill. Return a 500 response
      if (fs.statSync(await download.path()).size < 1000) {
        response.status(500).send('Downloaded file is too small');
        return;
      }

      await pipePdfDownloadToResponse(download, response);
    });
  },
);
