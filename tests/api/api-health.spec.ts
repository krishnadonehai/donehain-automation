import { test, expect, request } from '@playwright/test';

import fs from 'fs';
import path from 'path';

import {
  API_CONFIG,
  API_SUITES,
  apiChecklistProgress,
} from './config/api-config';
import { apiInventory } from './config/api-inventory';
import { executeApi } from './helpers/api-helper';
import { loadAccessBag } from '../../utils/session';

test.describe('DoneHai API Automation Suite', () => {

  test.beforeAll(() => {
    console.log(`API testing checklist ${apiChecklistProgress().label}`);
  });

  test('every inventory module belongs to an API suite', () => {
    const known = new Set(API_SUITES.map((suite) => suite.module));
    const missing = [...new Set(apiInventory.map((api) => api.module))]
      .filter((module) => !known.has(module));

    expect(missing, 'Add the missing module to API_SUITES in api-config.ts').toEqual([]);
  });

  for (const suite of API_SUITES) {
    const suiteApis = apiInventory.filter((api) => api.module === suite.module);

    test.describe(`API Suite | ${suite.name}`, () => {
      for (const api of suiteApis) {
        test(`${api.id} | ${api.module} | ${api.name}`, async () => {

          // Skip POST APIs until actual request payload is configured.
          if (api.method === 'POST' && !api.body) {
            test.skip(true, 'Actual POST payload not configured yet');
          }

          const authPath = path.resolve(
            process.cwd(),
            API_CONFIG.authStatePath
          );

          // Check authentication state.
          if (api.authRequired && !fs.existsSync(authPath)) {
            throw new Error(`Authentication state not found: ${authPath}`);
          }

          const access = api.authRequired ? await loadAccessBag() : null;
          if (api.authRequired && !access?.accessToken) {
            throw new Error('Saved access token not found in playwright/.auth/access.json');
          }

          // Create API request context. DoneHai reads the bearer token, not only the cookie.
          const apiContext = await request.newContext({
            baseURL: API_CONFIG.baseURL,
            timeout: API_CONFIG.timeout,
            ...(api.authRequired
              ? {
                  storageState: authPath,
                  extraHTTPHeaders: { Authorization: `Bearer ${access!.accessToken}` },
                }
              : {}),
          });

          try {

            // Execute API.
            const response = await executeApi(apiContext, api);

            // Validate HTTP status.
            expect(
              response.status(),
              `${api.id} - ${api.endpoint}`
            ).toBe(api.expectedStatus);

            console.log(
              `${api.id} | ${api.name} | Status: ${response.status()}`
            );

          } finally {
            await apiContext.dispose();
          }

        });
      }
    });
  }

});
