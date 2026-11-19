
export type ApiMethod = 'GET' | 'POST';

export interface ApiDefinition {
  id: string;
  module: string;
  name: string;
  method: ApiMethod;
  endpoint: string;
  expectedStatus: number;
  authRequired: boolean;
  body?: Record<string, unknown>;
}

export const apiInventory: ApiDefinition[] = [

  // OFFICES
  {
    id: 'API-001',
    module: 'Offices',
    name: 'Attendance Statistics',
    method: 'GET',
    endpoint: '/api/offices/stats/attendance?period=1',
    expectedStatus: 200,
    authRequired: true
  },
  {
    id: 'API-002',
    module: 'Offices',
    name: 'Employee Statistics',
    method: 'GET',
    endpoint: '/api/offices/stats/employees',
    expectedStatus: 200,
    authRequired: true
  },
  {
    id: 'API-003',
    module: 'Offices',
    name: 'Get Offices',
    method: 'GET',
    endpoint: '/api/offices',
    expectedStatus: 200,
    authRequired: true
  },
  {
    id: 'API-004',
    module: 'Offices',
    name: 'Get Offices Limit 200',
    method: 'GET',
    endpoint: '/api/offices?limit=200',
    expectedStatus: 200,
    authRequired: true
  },

  // ACTIVITIES
  {
    id: 'API-005',
    module: 'Activities',
    name: 'Daily Activity Summary',
    method: 'GET',
    endpoint: '/api/activities/daily-summary?start_date=2026-11-12&end_date=2026-11-12',
    expectedStatus: 200,
    authRequired: true
  },

  // DAILY CALLS
  {
    id: 'API-006',
    module: 'Daily Calls',
    name: 'Daily Calls Days',
    method: 'GET',
    endpoint: '/api/daily-calls/days?from=2026-11-12&to=2026-11-12&limit=500&offset=0',
    expectedStatus: 200,
    authRequired: true
  },
  {
    id: 'API-007',
    module: 'Daily Calls',
    name: 'Daily Calls Filter Options',
    method: 'GET',
    endpoint: '/api/daily-calls/filter-options',
    expectedStatus: 200,
    authRequired: true
  },

  // EMPLOYEES
  {
    id: 'API-008',
    module: 'Employees',
    name: 'Employee Departments',
    method: 'GET',
    endpoint: '/api/employees/departments',
    expectedStatus: 200,
    authRequired: true
  },
  {
    id: 'API-009',
    module: 'Employees',
    name: 'Active Employees',
    method: 'GET',
    endpoint: '/api/employees?page=1&limit=20&status=active',
    expectedStatus: 200,
    authRequired: true
  },
  {
    id: 'API-020',
    module: 'Employees',
    name: 'Team Summary',
    method: 'GET',
    endpoint: '/api/employees/team-summary?status=active',
    expectedStatus: 200,
    authRequired: true
  },

  // DOCUMENTS
  {
    id: 'API-010',
    module: 'Documents',
    name: 'Get Documents',
    method: 'GET',
    endpoint: '/api/documents/',
    expectedStatus: 200,
    authRequired: true
  },

  // AUTHENTICATION
  {
    id: 'API-011',
    module: 'Authentication',
    name: 'Eligible Organizations',
    method: 'GET',
    endpoint: '/api/auth/eligible-organizations',
    expectedStatus: 200,
    authRequired: true
  },

  // ORGANIZATION SETTINGS
  {
    id: 'API-012',
    module: 'Organization Settings',
    name: 'Get Organization Settings',
    method: 'GET',
    endpoint: '/api/org-settings',
    expectedStatus: 200,
    authRequired: true
  },
  {
    id: 'API-013',
    module: 'Organization Settings',
    name: 'Get Holidays',
    method: 'GET',
    endpoint: '/api/org-settings/holidays?year=2026',
    expectedStatus: 200,
    authRequired: true
  },

  // RCPA
  {
    id: 'API-014',
    module: 'RCPA',
    name: 'RCPA Insights',
    method: 'GET',
    endpoint: '/api/rcpa/insights?date_from=2026-11-12&date_to=2026-11-12',
    expectedStatus: 200,
    authRequired: true
  },

  // REPORTS
  {
    id: 'API-015',
    module: 'Reports',
    name: 'Report Options',
    method: 'GET',
    endpoint: '/api/reports/options',
    expectedStatus: 200,
    authRequired: true
  },
  {
    id: 'API-016',
    module: 'Reports',
    name: 'Performance Report',
    method: 'GET',
    endpoint: '/api/reports/performance?from=2026-11-01&to=2026-11-12&cost_model=complete&cost_basis=approved&view=overview&limit=200&offset=0',
    expectedStatus: 200,
    authRequired: true
  },

  // BEATS
  {
    id: 'API-017',
    module: 'Beats',
    name: 'Approval Override Flags',
    method: 'GET',
    endpoint: '/api/beats/approvals/override-flags',
    expectedStatus: 200,
    authRequired: true
  },

  // POWER USERS
  {
    id: 'API-018',
    module: 'Power Users',
    name: 'Get Power Users',
    method: 'GET',
    endpoint: '/api/power-users?includeScopes=true',
    expectedStatus: 200,
    authRequired: true
  },

  // ATTENDANCE
  {
    id: 'API-019',
    module: 'Attendance',
    name: 'Regularization Requests',
    method: 'GET',
    endpoint: '/api/attendance/regularization-requests?from=2026-11-12&to=2026-11-12',
    expectedStatus: 200,
    authRequired: true
  },

  // TRAVEL CLAIMS
  {
    id: 'API-021',
    module: 'Travel Claims',
    name: 'Get Travel Claims',
    method: 'GET',
    endpoint: '/api/travel-claims?start=2026-10-14&end=2026-11-12',
    expectedStatus: 200,
    authRequired: true
  },

  // OTP AUTHENTICATION
  {
    id: 'API-022',
    module: 'OTP Authentication',
    name: 'Check User Access',
    method: 'POST',
    endpoint: '/api/otp-auth/check-user-access',
    expectedStatus: 200,
    authRequired: false
  },
  {
    id: 'API-023',
    module: 'OTP Authentication',
    name: 'Verify User OTP',
    method: 'POST',
    endpoint: '/api/otp-auth/verify-user-otp',
    expectedStatus: 200,
    authRequired: false
  },

  // REFRESH TOKEN
  {
    id: 'API-024',
    module: 'Authentication',
    name: 'Refresh Token',
    method: 'POST',
    endpoint: '/auth/refresh',
    expectedStatus: 200,
    authRequired: true
  }

];
