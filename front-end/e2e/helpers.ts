import { expect, request, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000';
export const DEFAULT_PASSWORD = 'E2E secure passphrase 2026';

export async function createApiSession(
  identifier: string,
  password = DEFAULT_PASSWORD
): Promise<{ api: APIRequestContext; accessToken: string }> {
  const api = await request.newContext({ baseURL: API_URL });
  const response = await api.post('/api/auth/login', {
    data: { identifier, password }
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json() as { accessToken: string };
  return { api, accessToken: body.accessToken };
}

export const authHeaders = (accessToken: string): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`
});

export async function loginBrowser(
  page: Page,
  identifier: string,
  password = DEFAULT_PASSWORD
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export async function mockCloudinaryUploads(page: Page): Promise<() => number> {
  let uploadCount = 0;
  await page.route('https://api.cloudinary.com/**', async (route) => {
    uploadCount += 1;
    const request = route.request();
    const requestBody = request.postDataBuffer()?.toString('utf8') ?? '';
    const folder = requestBody.match(/name="folder"\r?\n\r?\n([^\r\n]+)/)?.[1]
      ?? 'rent-apartment/e2e';
    const contentType = request.url().includes('/raw/upload') ? 'raw' : 'image';
    const extension = contentType === 'raw' ? 'pdf' : 'png';
    const publicId = `${folder}/upload-${uploadCount}`;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        secure_url: `https://res.cloudinary.com/e2e/${contentType}/authenticated/v1/${publicId}.${extension}`,
        original_filename: `upload-${uploadCount}`,
        bytes: 128,
        resource_type: contentType,
        public_id: publicId,
        asset_id: `e2e-asset-${uploadCount}`,
        version: 1,
        format: extension,
        type: 'authenticated'
      })
    });
  });
  return () => uploadCount;
}

export const imageFile = (name: string) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from('89504e470d0a1a0a', 'hex')
});

export const pdfFile = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 E2E document')
});
