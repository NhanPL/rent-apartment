import http from 'k6/http';
import { check, sleep } from 'k6';
import { authParams, baseUrl, login } from './lib/session.js';

export const options = {
  vus: 1,
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750'],
    checks: ['rate>0.99']
  }
};

export function setup() {
  return { accessToken: login() };
}

export default function ({ accessToken }) {
  const responses = http.batch([
    ['GET', `${baseUrl}/health`, null, { tags: { endpoint: 'health' } }],
    ['GET', `${baseUrl}/api/dashboard/summary`, null, { ...authParams(accessToken), tags: { endpoint: 'dashboard_summary' } }],
    ['GET', `${baseUrl}/api/invoices?page=1&pageSize=20`, null, { ...authParams(accessToken), tags: { endpoint: 'invoice_list' } }],
    ['GET', `${baseUrl}/api/payments/requests?page=1&pageSize=20`, null, { ...authParams(accessToken), tags: { endpoint: 'payment_list' } }]
  ]);
  check(responses, {
    'all smoke endpoints return 200': (results) => results.every((response) => response.status === 200)
  });
  sleep(1);
}
