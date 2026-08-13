import { expect, test } from '@playwright/test';
import {
  authHeaders,
  createApiSession,
  imageFile,
  loginBrowser,
  mockCloudinaryUploads
} from './helpers';

const MANAGER_PASSWORD = 'Local Manager 2026!';
const TENANT_PASSWORD = 'Local Tenant 2026!';
const currentMonth = new Date().toISOString().slice(0, 7);
const previousMonthDate = new Date(`${currentMonth}-01T00:00:00Z`);
previousMonthDate.setUTCMonth(previousMonthDate.getUTCMonth() - 1);
const previousMonth = previousMonthDate.toISOString().slice(0, 7);

test.describe.configure({ retries: 0 });

test('utility approval produces payable invoices and an immutable payment history', async ({ browser, page }) => {
  test.setTimeout(180_000);
  const tenantUploadCount = await mockCloudinaryUploads(page);
  await loginBrowser(page, 'tenant', TENANT_PASSWORD);
  await expect(page).toHaveURL(/\/my-room$/);

  await page.getByLabel('Reading month').fill(currentMonth);
  await page.getByLabel('Current electricity reading').fill('150');
  await page.getByLabel('Current water reading').fill('35');
  const electricityInput = page.getByRole('button', { name: 'Select electricity image' })
    .locator('xpath=preceding-sibling::input[@type="file"]');
  const waterInput = page.getByRole('button', { name: 'Select water image' })
    .locator('xpath=preceding-sibling::input[@type="file"]');
  await electricityInput.setInputFiles(imageFile('electricity-meter.png'));
  await waterInput.setInputFiles(imageFile('water-meter.png'));
  expect(tenantUploadCount()).toBe(0);
  const initialReadingResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/utility-readings')
  );
  await page.getByRole('button', { name: 'Save monthly readings' }).click();
  const initialReadingResult = await initialReadingResponse;
  expect(initialReadingResult.ok(), await initialReadingResult.text()).toBeTruthy();
  expect(tenantUploadCount()).toBe(2);
  await expect(page.getByRole('button', { name: 'Save monthly readings' })).toBeDisabled();

  const managerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const managerPage = await managerContext.newPage();
  await loginBrowser(managerPage, 'manager', MANAGER_PASSWORD);
  await managerPage.goto(`/utilities?month=${currentMonth}`);
  const readingRow = managerPage.getByRole('row', { name: /Demo Tenant/ });
  await expect(readingRow).toContainText('Submitted');
  await readingRow.getByRole('button', { name: 'View utility reading' }).click();
  const detail = managerPage.getByRole('dialog', { name: 'Utility Reading Detail' });
  await expect(detail.getByRole('link', { name: 'electricity-meter.png' })).toBeVisible();
  await expect(detail.getByRole('link', { name: 'water-meter.png' })).toBeVisible();
  await detail.getByRole('button', { name: 'Reject' }).click();
  const rejectModal = managerPage.locator('.ant-modal').filter({ hasText: 'Reject utility reading' });
  await expect(rejectModal).toBeVisible();
  await rejectModal.getByLabel('Reject reason').fill('Please retake both meter photos');
  const rejectResponse = managerPage.waitForResponse((response) =>
    response.request().method() === 'POST'
      && /\/api\/utility-readings\/[^/]+\/reject$/.test(response.url())
  );
  await rejectModal.getByRole('button', { name: 'Reject', exact: true }).click();
  const rejectResult = await rejectResponse;
  expect(rejectResult.ok(), await rejectResult.text()).toBeTruthy();
  await expect(rejectModal).toBeHidden();

  await page.reload();
  await expect(page.getByText('Please retake both meter photos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save monthly readings' })).toBeEnabled();
  await page.getByLabel('Current electricity reading').fill('151');
  await page.getByLabel('Current water reading').fill('36');
  await electricityInput.setInputFiles(imageFile('electricity-meter-retake.png'));
  await waterInput.setInputFiles(imageFile('water-meter-retake.png'));
  const correctedReadingResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/utility-readings')
  );
  await page.getByRole('button', { name: 'Save monthly readings' }).click();
  const correctedReadingResult = await correctedReadingResponse;
  expect(correctedReadingResult.ok(), await correctedReadingResult.text()).toBeTruthy();
  expect(tenantUploadCount()).toBe(4);

  const manager = await createApiSession('manager', MANAGER_PASSWORD);
  const tenant = await createApiSession('tenant', TENANT_PASSWORD);
  const readingsResponse = await manager.api.get(
    `/api/utility-readings?month=${currentMonth}&status=SUBMITTED&page=1&pageSize=20`,
    { headers: authHeaders(manager.accessToken) }
  );
  expect(readingsResponse.ok(), await readingsResponse.text()).toBeTruthy();
  const readings = await readingsResponse.json() as { items: Array<{ id: string; evidence_count: number }> };
  const reading = readings.items[0];
  expect(reading.evidence_count).toBe(4);
  expect((await manager.api.post(`/api/utility-readings/${reading.id}/approve`, {
    headers: authHeaders(manager.accessToken),
    data: {}
  })).ok()).toBeTruthy();

  const invoiceResponse = await manager.api.post(`/api/invoices/from-reading/${reading.id}`, {
    headers: authHeaders(manager.accessToken),
    data: {}
  });
  expect(invoiceResponse.ok(), await invoiceResponse.text()).toBeTruthy();
  const invoice = await invoiceResponse.json() as { id: string; contract_id: string; room_id: string; total: number };
  const issueResponse = await manager.api.post(`/api/invoices/${invoice.id}/issue`, {
    headers: authHeaders(manager.accessToken),
    data: {
      bank_code: 'TCB',
      bank_account_no: '1900123456789',
      bank_account_name: 'DEMO MANAGER',
      transfer_note: `RENT${currentMonth.replace('-', '')}`
    }
  });
  expect(issueResponse.ok(), await issueResponse.text()).toBeTruthy();

  const oldInvoiceResponse = await manager.api.post('/api/invoices', {
    headers: authHeaders(manager.accessToken),
    data: {
      contract_id: invoice.contract_id,
      room_id: invoice.room_id,
      month: previousMonth,
      status: 'DRAFT',
      due_date: `${previousMonth}-15`,
      note: 'E2E previous invoice',
      discount: 0,
      rent_amount: 3500000,
      other_fees: 0,
      electricity_prev: 100,
      electricity_curr: 110,
      water_prev: 20,
      water_curr: 22,
      electric_unit_price: 4000,
      water_unit_price: 15000
    }
  });
  expect(oldInvoiceResponse.ok(), await oldInvoiceResponse.text()).toBeTruthy();
  const oldInvoice = await oldInvoiceResponse.json() as { id: string };
  expect((await manager.api.post(`/api/invoices/${oldInvoice.id}/issue`, {
    headers: authHeaders(manager.accessToken),
    data: {
      bank_code: 'TCB',
      bank_account_no: '1900123456789',
      bank_account_name: 'DEMO MANAGER',
      transfer_note: `RENT${previousMonth.replace('-', '')}`
    }
  })).ok()).toBeTruthy();

  const paymentRequestResponse = await tenant.api.get(`/api/payments/invoices/${invoice.id}/request`, {
    headers: authHeaders(tenant.accessToken)
  });
  expect(paymentRequestResponse.ok(), await paymentRequestResponse.text()).toBeTruthy();
  const paymentRequest = await paymentRequestResponse.json() as {
    id: string;
    amount: number;
    qr_image_url: string;
    bank_code: string;
    bank_account_no: string;
    transfer_note: string;
  };
  expect(paymentRequest).toMatchObject({
    bank_code: 'TCB',
    bank_account_no: '1900123456789',
    transfer_note: `RENT${currentMonth.replace('-', '')}`
  });
  expect(paymentRequest.qr_image_url).toContain('img.vietqr.io');
  expect(paymentRequest.qr_image_url).toContain(String(Math.round(paymentRequest.amount)));

  await page.route('https://img.vietqr.io/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Current month invoice' })).toBeVisible();
  await expect(page.getByText('1900123456789')).toBeVisible();
  await expect(page.getByRole('img', { name: /VietQR payment/ })).toBeVisible();
  await expect(page.getByRole('button', { name: `View invoice ${previousMonthDate.toLocaleDateString('en-GB', { month: '2-digit', year: 'numeric' })}` })).toBeVisible();

  const partialAmount = Math.max(1, Math.floor(paymentRequest.amount / 2));
  const proofFolder = `rent-apartment/payment-proofs/${tenant.userId}`;
  const submitProof = async (amount: number, key: string) => {
    const response = await tenant.api.post(`/api/payments/requests/${paymentRequest.id}/proofs`, {
      headers: { ...authHeaders(tenant.accessToken), 'Idempotency-Key': key },
      data: {
        file_name: `${key}.png`,
        file_url: `https://res.cloudinary.com/e2e/image/authenticated/v1/${proofFolder}/${key}.png`,
        mime_type: 'image/png',
        file_size: 128,
        public_id: `${proofFolder}/${key}`,
        asset_id: `asset-${key}`,
        resource_type: 'image',
        version: 1,
        format: 'png',
        delivery_type: 'authenticated',
        transfer_amount: amount,
        payer_note: key
      }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<{ id: string }>;
  };

  const rejectedProof = await submitProof(partialAmount, 'proof-rejected-001');
  expect((await manager.api.post(`/api/payments/proofs/${rejectedProof.id}/reject`, {
    headers: authHeaders(manager.accessToken),
    data: { reason: 'Bank reference is not visible' }
  })).ok()).toBeTruthy();
  const partialProof = await submitProof(partialAmount, 'proof-partial-002');
  const partialApproval = await manager.api.post(`/api/payments/proofs/${partialProof.id}/approve`, {
    headers: authHeaders(manager.accessToken),
    data: {}
  });
  expect(partialApproval.ok(), await partialApproval.text()).toBeTruthy();
  expect((await partialApproval.json() as { invoice: { status: string } }).invoice.status).toBe('PARTIALLY_PAID');

  const remaining = paymentRequest.amount - partialAmount;
  const finalProof = await submitProof(remaining, 'proof-final-003');
  const finalApproval = await manager.api.post(`/api/payments/proofs/${finalProof.id}/approve`, {
    headers: authHeaders(manager.accessToken),
    data: {}
  });
  expect(finalApproval.ok(), await finalApproval.text()).toBeTruthy();
  expect((await finalApproval.json() as { invoice: { status: string } }).invoice.status).toBe('PAID');
  expect((await manager.api.delete(`/api/invoices/${invoice.id}`, {
    headers: authHeaders(manager.accessToken)
  })).status()).toBe(409);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Current month invoice' }).locator('..')).toContainText('PAID');
  await manager.api.dispose();
  await tenant.api.dispose();
  await managerContext.close();
});
