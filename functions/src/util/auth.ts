import { Response } from 'express';
import {
  onRequest,
  HttpsFunction,
  Request,
  HttpsOptions,
} from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

/**
 * Higher order function to wrap firebase function onRequest() to require authentication with a static token.
 *
 * @param config The configuration for the firebase function.
 * @param handler The original request handler function.
 * @returns The wrapped request handler function with authentication.
 */
export function onAuthorizedRequest(
  config: HttpsOptions,
  handler: (req: Request, res: Response) => void | Promise<void>,
): HttpsFunction {
  return onRequest(
    {
      ...config,
      secrets: [...(config.secrets || []), 'AUTH_TOKEN'],
    },
    async (req, res) => {
      const authToken = process.env.AUTH_TOKEN;
      const requestToken = req.headers['authorization']?.split('Bearer ')[1];

      if (!requestToken || requestToken !== authToken) {
        logger.warn('Unauthorized request');
        res.status(401).send('Unauthorized');
        return;
      }

      await handler(req, res);
    },
  );
}
