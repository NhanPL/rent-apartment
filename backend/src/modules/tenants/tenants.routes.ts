import { Router } from 'express';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody, parseEmptyBody, parseQuery, registerUuidParams } from '../../shared/utils/validation';
import { presentDocumentAsset } from '../documents/document-assets.service';
import {
  createManagedTenant,
  deleteManagedTenant,
  exportManagedTenantContract,
  exportManagedTenantData,
  getManagedTenant,
  identityDocumentUpdateSchema,
  listManagedTenantContracts,
  listManagedTenantInvoices,
  listManagedTenantPayments,
  listManagedTenants,
  resendManagedTenantActivation,
  tenantCreateSchema,
  tenantListQuerySchema,
  tenantPatchSchema,
  updateManagedTenant,
  updateManagedTenantIdentityDocuments
} from './tenant-management.service';

const router = Router();
registerUuidParams(router, ['id']);

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await listManagedTenants(
    parseQuery(tenantListQuerySchema, req.query),
    req.auth!.userId
  ));
}));

router.get('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const data = await getManagedTenant(req.params.id, req.auth!.userId);
  const documents = data.identity_documents;
  res.json({
    ...data,
    identity_documents: {
      front: documents.front
        ? await presentDocumentAsset(req, 'TENANT_DOCUMENT', documents.front, req.auth!)
        : null,
      back: documents.back
        ? await presentDocumentAsset(req, 'TENANT_DOCUMENT', documents.back, req.auth!)
        : null
    }
  });
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const result = await createManagedTenant(
    parseBody(tenantCreateSchema, req.body),
    req.auth!.userId
  );
  res.status(201).json({
    message: 'Tenant created successfully',
    tenantId: result.tenantId,
    userId: result.userId,
    emailSent: result.emailSent
  });
}));

router.post('/:id/resend-activation', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  const result = await resendManagedTenantActivation(req.params.id, req.auth!.userId);
  res.json({
    message: result.emailSent
      ? 'Activation invitation sent successfully'
      : 'Activation invitation renewed, but email delivery is not configured',
    emailSent: result.emailSent,
    expiresAt: result.expiresAt
  });
}));

router.patch('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await updateManagedTenant(
    req.params.id,
    parseBody(tenantPatchSchema, req.body),
    req.auth!.userId
  ));
}));

router.put('/:id/identity-documents', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const documents = await updateManagedTenantIdentityDocuments(
    req.params.id,
    parseBody(identityDocumentUpdateSchema, req.body),
    req.auth!.userId
  );
  res.json({
    front: documents.front
      ? await presentDocumentAsset(req, 'TENANT_DOCUMENT', documents.front, req.auth!)
      : null,
    back: documents.back
      ? await presentDocumentAsset(req, 'TENANT_DOCUMENT', documents.back, req.auth!)
      : null
  });
}));

router.delete('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  const result = await deleteManagedTenant(req.params.id, req.auth!.userId);
  res.json({
    message: result.status === 'ANONYMIZED'
      ? 'Tenant data was anonymized successfully.'
      : 'Tenant access was removed and anonymization was scheduled after the retention period.',
    ...result
  });
}));

router.get('/:id/data-export', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const payload = await exportManagedTenantData(req.params.id, req.auth!.userId);
  res.setHeader('Cache-Control', 'no-store');
  res.json(payload);
}));

router.get('/:id/contracts', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await listManagedTenantContracts(req.params.id, req.auth!.userId));
}));

router.get('/:id/invoices', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await listManagedTenantInvoices(req.params.id, req.auth!.userId));
}));

router.get('/:id/payments', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await listManagedTenantPayments(req.params.id, req.auth!.userId));
}));

router.post('/:id/export-contract', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  res.json(await exportManagedTenantContract(req.params.id, req.auth!.userId));
}));

export default router;
