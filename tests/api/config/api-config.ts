
import path from 'path';

export const API_CONFIG = {
  baseURL: 'https://api.st.donehai.com',
  timeout: 30000,
  maxResponseTime: 5000,

  token: process.env.API_TOKEN || '',

  authStatePath: path.resolve(
    process.cwd(),
    'playwright/.auth/user.json'
  ),
};

/** Learning topics. `done: true` means that topic is already covered. */
export interface ApiLearningItem {
  id: string;
  title: string;
  done: boolean;
}

export const API_TESTING_CHECKLIST: ApiLearningItem[] = [
  { id: 'status-code', title: 'Status code validation', done: true },
  { id: 'response-body', title: 'Response body validation', done: false },
  { id: 'json-schema', title: 'JSON schema validation', done: false },
  { id: 'response-time', title: 'Response time validation', done: false },
  { id: 'auth-jwt', title: 'Authentication and JWT validation', done: true },
  { id: 'refresh-cookie', title: 'Refresh token and cookie validation', done: false },
  { id: 'authorization', title: 'Authorization / role permissions', done: true },
  { id: 'positive-negative', title: 'Positive and negative test cases', done: false },
  { id: 'crud', title: 'CRUD operations', done: false },
  { id: 'input-validation', title: 'SQL injection and input validation', done: false },
  { id: 'pagination-search', title: 'Pagination, filters and search', done: false },
  { id: 'regression', title: 'Regression testing', done: false },
];

export function apiChecklistProgress(
  items: ApiLearningItem[] = API_TESTING_CHECKLIST
) {
  const done = items.filter((item) => item.done).length;
  return {
    done,
    total: items.length,
    label: `${done}/${items.length}`,
  };
}

/**
 * Runnable groups. `module` must match `ApiDefinition.module`
 * in api-inventory.ts. The health spec opens one describe per suite.
 */
export interface ApiSuite {
  id: string;
  name: string;
  module: string;
}

export const API_SUITES: ApiSuite[] = [
  { id: 'offices', name: 'Offices', module: 'Offices' },
  { id: 'activities', name: 'Activities', module: 'Activities' },
  { id: 'daily-calls', name: 'Daily Calls', module: 'Daily Calls' },
  { id: 'employees', name: 'Employees', module: 'Employees' },
  { id: 'documents', name: 'Documents', module: 'Documents' },
  { id: 'authentication', name: 'Authentication', module: 'Authentication' },
  { id: 'organization-settings', name: 'Organization Settings', module: 'Organization Settings' },
  { id: 'rcpa', name: 'RCPA', module: 'RCPA' },
  { id: 'reports', name: 'Reports', module: 'Reports' },
  { id: 'beats', name: 'Beats', module: 'Beats' },
  { id: 'power-users', name: 'Power Users', module: 'Power Users' },
  { id: 'attendance', name: 'Attendance', module: 'Attendance' },
  { id: 'travel-claims', name: 'Travel Claims', module: 'Travel Claims' },
  { id: 'otp-authentication', name: 'OTP Authentication', module: 'OTP Authentication' },
];
