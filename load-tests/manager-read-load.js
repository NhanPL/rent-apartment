import http from 'k6/http';
import { check, sleep } from 'k6';
import { authParams, baseUrl, login } from './lib/session.js';

const peakVus = Number(__ENV.PEAK_VUS || 20);

export const options = {
  scenarios: {
    manager_reads: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: __ENV.RAMP_UP || '30s', target: peakVus },
        { duration: __ENV.HOLD || '2m', target: peakVus },
        { duration: __ENV.RAMP_DOWN || '30s', target: 0 }
      ],
      gracefulRampDown: '10s'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:dashboard_summary}': ['p(95)<750'],
    'http_req_duration{endpoint:invoice_list}': ['p(95)<750'],
    'http_req_duration{endpoint:payment_list}': ['p(95)<750'],
    checks: ['rate>0.99']
  }
};

export function setup() {
  return { accessToken: login() };
}

export default function ({ accessToken }) {
  const month = __ENV.MONTH || '2026-06';
  const params = authParams(accessToken);
  const responses = http.batch([
    ['GET', `${baseUrl}/api/dashboard/summary?month=${month}`, null, { ...params, tags: { endpoint: 'dashboard_summary' } }],
    ['GET', `${baseUrl}/api/invoices?month=${month}&page=1&pageSize=20`, null, { ...params, tags: { endpoint: 'invoice_list' } }],
    ['GET', `${baseUrl}/api/payments/requests?month=${month}&page=1&pageSize=20`, null, { ...params, tags: { endpoint: 'payment_list' } }],
    ['GET', `${baseUrl}/api/utility-readings?month=${month}&page=1&pageSize=20`, null, { ...params, tags: { endpoint: 'utility_list' } }]
  ]);
  check(responses, {
    'manager read endpoints return 200': (results) => results.every((response) => response.status === 200)
  });
  sleep(Math.random() * 2 + 1);
}
