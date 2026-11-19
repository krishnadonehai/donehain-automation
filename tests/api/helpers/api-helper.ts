
import {
  APIRequestContext,
  expect
} from '@playwright/test';

import { API_CONFIG } from '../config/api-config';

interface ApiTestDefinition {
  id: string;
  name: string;
  method: string;
  endpoint: string;
  expectedStatus: number;
  body?: Record<string, unknown>;
}

export async function executeApi(
  request: APIRequestContext,
  api: ApiTestDefinition
) {
  const startTime = Date.now();

  const response = await request.fetch(api.endpoint, {
    method: api.method,
    data: api.body,
    timeout: API_CONFIG.timeout,
  });

  const responseTime = Date.now() - startTime;

  console.log('\n----------------------------');
  console.log('API:', api.id);
  console.log('Name:', api.name);
  console.log('Status:', response.status());
  console.log('Response Time:', responseTime, 'ms');
  console.log('----------------------------');

  expect(
    response.status(),
    `${api.id} ${api.name}: unexpected HTTP status`
  ).toBe(api.expectedStatus);

  expect(
    responseTime,
    `${api.id} ${api.name}: response too slow`
  ).toBeLessThan(API_CONFIG.maxResponseTime);

  return response;
}
