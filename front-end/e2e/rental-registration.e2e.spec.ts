import { expect, test } from '@playwright/test';
import {
  authHeaders,
  createApiSession,
  loginBrowser,
  mockCloudinaryUploads,
  pdfFile
} from './helpers';

test.describe.configure({ retries: 0 });

test('manager completes rental registration from vacancy through handover', async ({ page }) => {
  const uploadCount = await mockCloudinaryUploads(page);
  await loginBrowser(page, 'e2e-manager');
  await page.goto('/rental-registration');
  await expect(page.getByRole('heading', { name: 'Rental registration' })).toBeVisible();

  const roomRow = page.getByRole('row', { name: /E2E-201/ });
  await expect(roomRow).toContainText('E2E Building');
  await roomRow.getByRole('button', { name: 'Select' }).click();

  const tenantSelector = page.locator('#tenant_id');
  await tenantSelector.click();
  await tenantSelector.fill('E2E Available Tenant');
  await page.keyboard.press('Enter');
  const reservationResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/rental-registration/reserve')
  );
  await page.getByRole('button', { name: 'Create draft reservation' }).click();
  const reservationResult = await reservationResponse;
  expect(reservationResult.ok(), await reservationResult.text()).toBeTruthy();
  await expect(page.getByRole('alert').filter({
    hasText: 'The registration has been saved. Documents and room handover can be completed when ready.'
  })).toBeVisible();

  await page.getByRole('tab', { name: /Add documents/ }).click();
  const registrationRow = page.getByRole('row', { name: /E2E Available Tenant/ });
  await registrationRow.getByRole('button', { name: 'Add documents' }).click();
  const modal = page.getByRole('dialog', { name: /Add documents/ });
  const fileInput = modal.locator('input[type=file]');
  await fileInput.setInputFiles([
    pdfFile('signed-contract.pdf'),
    pdfFile('tenant-addendum.pdf'),
    pdfFile('remove-before-save.pdf')
  ]);
  await expect(modal.getByText('signed-contract.pdf')).toBeVisible();
  await expect(modal.getByText('tenant-addendum.pdf')).toBeVisible();
  await modal.getByRole('button', { name: 'Remove remove-before-save.pdf' }).click();
  expect(uploadCount()).toBe(0);

  await modal.getByRole('button', { name: 'Save documents' }).click();
  await expect(modal).toBeHidden();
  expect(uploadCount()).toBe(2);

  const handoverTab = page.getByRole('tab', { name: 'Room handover (1)' });
  await expect(handoverTab).toBeVisible();
  await handoverTab.click();
  const handoverRow = page.getByRole('row', { name: /E2E Available Tenant/ });
  await expect(handoverRow).toContainText('Awaiting handover');
  await handoverRow.getByRole('button', { name: 'Handover' }).click();
  const handover = page.getByRole('dialog', { name: /Room handover/ });
  await handover.getByLabel('Initial electricity reading').fill('125');
  await handover.getByLabel('Initial water reading').fill('42');
  await handover.getByRole('button', { name: 'Handover and activate' }).click();
  await expect(page.getByText('Contract activated and initial utility readings recorded.')).toBeVisible();
  await expect(page.getByRole('row', { name: /E2E-201/ })).toHaveCount(0);

  const manager = await createApiSession('e2e-manager');
  const contracts = await manager.api.get('/api/contracts?status=ACTIVE&page=1&pageSize=100', {
    headers: authHeaders(manager.accessToken)
  });
  expect(contracts.ok(), await contracts.text()).toBeTruthy();
  const body = await contracts.json() as { items: Array<{ room_code: string; status: string }> };
  expect(body.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ room_code: 'E2E-201', status: 'ACTIVE' })
  ]));
  await manager.api.dispose();
});
