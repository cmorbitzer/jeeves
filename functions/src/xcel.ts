import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { pipePdfDownloadToResponse, withBrowser } from './util/browser';

/**
 * Download an Xcel Energy statement for the given account.
 *
 * @param accountNumber The account number to download the statement for. The number may be obscured in the format XX-12345678-XX.
 * @param statementDate The date of the statement to download in the format YYYY-MM-DD.
 *
 * @requires XCEL_USERNAME The username to log in to the Xcel Energy website.
 * @requires XCEL_PASSWORD The password to log in to the Xcel Energy website.
 *
 * @returns The PDF file of the statement.
 */
export const downloadXcelStatement = onRequest(
  {
    cors: true,
    memory: '2GiB',
    timeoutSeconds: 120,
    secrets: ['XCEL_USERNAME', 'XCEL_PASSWORD'],
  },
  async (request, response) => {
    logger.info(request.query);

    const accountNumber = request.query.accountNumber as string;
    const statementDate = request.query.statementDate as string;

    // Extract the main part of the account number, which is not obscured in email notifications
    const accountNumberDigits = accountNumber.match(/-\d+-/)![0].slice(1, -1);

    await withBrowser(async ({ page }) => {
      // Navigate to the login page
      await page.goto(
        'https://my.xcelenergy.com/MyAccount/XE_Login?template=XE_MA_Template',
      );

      // Fill in the login form
      await page.getByLabel('Email/Username*').fill(process.env.XCEL_USERNAME!);
      await page.getByLabel('Password*').fill(process.env.XCEL_PASSWORD!);
      await page.getByRole('button', { name: 'Sign In' }).click();
      logger.debug('Logged in');

      // Select the correct account to view the billing history for
      const accountRow = page.getByRole('row', { name: accountNumberDigits });
      await accountRow.locator('.slds-radio_faux').click();
      await accountRow.getByRole('link', { name: 'Manage Account' }).click();
      logger.debug('Navigated to account');

      // Navigate to the billing history page
      await page.getByRole('link', { name: 'Billing', exact: true }).click();
      logger.debug('Navigated to billing');

      // Navigate to the statements tab
      await page.getByRole('tab', { name: 'Statements' }).click();
      logger.debug('Navigated to statements');

      // Reformat the statement date to match the format displayed on the website
      const formattedDate = new Date(statementDate)
        .toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
        .toUpperCase();
      logger.debug(`Looking for statement from ${formattedDate}`);

      // Download the statement
      const downloadPromise = page.waitForEvent('download');
      await page
        .getByRole('row', { name: formattedDate })
        .getByRole('button', { name: 'Download statement' })
        .click();
      logger.debug('Clicked download button');

      await pipePdfDownloadToResponse(await downloadPromise, response);
    });
  },
);
