import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { chromium as playwright } from 'playwright';
import * as fs from 'fs';
import chromium = require('@sparticuz/chromium');

/**
 * Download an Xcel Energy statement for the given account.
 *
 * @param accountNumber The account number to download the statement for. The number may be obscured in the format XX-12345678-XX.
 * @param statementDate The date of the statement to download in the format YYYYMMDD.
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

    const accountNumberDigits = accountNumber.match(/\d+/)![0];

    const browser = await playwright.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    });

    logger.debug('Launched browser');

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(
      'https://my.xcelenergy.com/MyAccount/XE_Login?template=XE_MA_Template',
    );

    await page.getByLabel('Email/Username*').fill(process.env.XCEL_USERNAME!);
    await page.getByLabel('Password*').fill(process.env.XCEL_PASSWORD!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    logger.debug('Logged in');

    await page
      .getByRole('row', { name: accountNumberDigits })
      .getByRole('link', { name: 'Manage Account' })
      .click();
    logger.debug('Navigated to account');

    await page.getByRole('link', { name: 'Billing', exact: true }).click();
    logger.debug('Navigated to billing');

    await page.getByRole('tab', { name: 'Statements' }).click();
    logger.debug('Navigated to statements');

    const downloadPromise = page.waitForEvent('download');

    const year = statementDate.substring(0, 4);
    const month = statementDate.substring(4, 6);
    const day = statementDate.substring(6, 8);

    const date = new Date(`${year}-${month}-${day}`);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
    const formattedDate = date
      .toLocaleDateString('en-US', options)
      .toUpperCase();

    logger.debug(`Looking for statement from ${formattedDate}`);

    await page
      .getByRole('row', { name: formattedDate })
      .getByRole('button', { name: 'Download statement' })
      .click();

    logger.debug('Clicked download button');

    const download = await downloadPromise;
    const filePath = await download.path();
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename=${download.suggestedFilename()}`,
    );
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(response);

    logger.debug('Downloaded statement');

    await context.close();
    await browser.close();
  },
);
