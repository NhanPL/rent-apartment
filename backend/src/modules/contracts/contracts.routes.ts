import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody, parseQuery, registerUuidParams } from '../../shared/utils/validation';
import { presentDocumentAsset } from '../documents/document-assets.service';
import { CONTRACT_STATUSES } from '../../shared/types/database';
import {
  cloudinaryDeliveryTypeValues,
  uploadResourceTypeValues
} from '../uploads/uploads.service';
import {
  activateContract,
  addContractDocument,
  addContractTenant,
  cancelContract,
  createContract,
  deleteContractDocument,
  endContract,
  getContractDetails,
  listContracts,
  removeContractTenant,
  updateContract,
  updateContractTenant
} from './contracts.service';

const router = Router();
registerUuidParams(router, ['id', 'documentId', 'tenantId']);

const nullableString = z.string().trim().nullable().optional();
const contractStatusSchema = z.enum(CONTRACT_STATUSES);
const contractBusinessStageSchema = z.enum([
  'RESERVED', 'WAITING_SIGNATURE', 'WAITING_HANDOVER', 'ACTIVE', 'CANCELLED', 'ENDED'
]);
const contractListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(200).default(''),
  building_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  status: contractStatusSchema.optional(),
  business_stage: contractBusinessStageSchema.optional()
});
const participantRemovalQuerySchema = z.object({
  left_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
const contractTenantSchema = z.object({
  tenant_id: z.string().uuid(),
  is_primary: z.boolean().optional(),
  joined_at: z.string().trim().min(1).optional(),
  left_at: nullableString
});
const contractCreateSchema = z.object({
  room_id: z.string().uuid(),
  contract_code: z.string().trim().min(1).nullable().optional(),
  status: contractStatusSchema.optional(),
  start_date: z.string().trim().min(1),
  end_date: nullableString,
  move_in_date: nullableString,
  move_out_date: nullableString,
  rent_price: z.coerce.number().nonnegative().nullable().optional(),
  deposit_amount: z.coerce.number().nonnegative().nullable().optional(),
  billing_day: z.coerce.number().int().min(1).max(28).nullable().optional(),
  note: nullableString,
  tenants: z.array(contractTenantSchema).optional()
});
const contractUpdateSchema = contractCreateSchema.omit({ status: true, tenants: true }).partial();
const contractCloseSchema = z.object({
  end_date: z.string().trim().min(1).nullable().optional(),
  move_out_date: z.string().trim().min(1).nullable().optional(),
  note: nullableString
});
const contractTenantUpdateSchema = z.object({
  is_primary: z.boolean().optional(),
  joined_at: z.string().trim().min(1).optional(),
  left_at: nullableString
});
const contractDocumentSchema = z.object({
  doc_type: z.enum(['SIGNED_SCAN', 'ADDENDUM', 'TERMINATION', 'OTHER']),
  file_name: nullableString,
  file_url: z.string().trim().url(),
  mime_type: z.string().trim().min(1),
  file_size: z.coerce.number().int().positive(),
  resource_type: z.enum(uploadResourceTypeValues).optional(),
  public_id: z.string().trim().min(1).optional(),
  asset_id: z.string().trim().min(1).optional(),
  version: z.coerce.number().int().positive().optional(),
  format: z.string().trim().min(1).max(20).optional(),
  delivery_type: z.enum(cloudinaryDeliveryTypeValues).optional(),
  note: nullableString
});

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await listContracts(parseQuery(contractListQuerySchema, req.query), req.auth!.userId));
}));

router.get('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const data = await getContractDetails(req.params.id, req.auth!.userId);
  res.json({
    ...data,
    documents: await Promise.all(data.documents.map((document) => (
      presentDocumentAsset(req, 'CONTRACT_DOCUMENT', document as { id: string }, req.auth!)
    )))
  });
}));

router.post('/:id/documents', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const document = await addContractDocument(
    req.params.id,
    parseBody(contractDocumentSchema, req.body),
    { userId: req.auth!.userId, role: 'MANAGER' }
  );
  res.status(201).json(await presentDocumentAsset(
    req, 'CONTRACT_DOCUMENT', document as { id: string }, req.auth!
  ));
}));

router.delete('/:id/documents/:documentId', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  await deleteContractDocument(req.params.id, req.params.documentId, req.auth!.userId);
  res.status(204).send();
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.status(201).json(await createContract(parseBody(contractCreateSchema, req.body), req.auth!.userId));
}));

router.patch('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await updateContract(req.params.id, parseBody(contractUpdateSchema, req.body), req.auth!.userId));
}));

router.post('/:id/activate', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await activateContract(req.params.id, req.auth!.userId));
}));

router.post('/:id/end', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await endContract(req.params.id, parseBody(contractCloseSchema, req.body ?? {}), req.auth!.userId));
}));

router.post('/:id/cancel', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await cancelContract(req.params.id, parseBody(contractCloseSchema, req.body ?? {}), req.auth!.userId));
}));

router.post('/:id/tenants', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.status(201).json(await addContractTenant(
    req.params.id, parseBody(contractTenantSchema, req.body), req.auth!.userId
  ));
}));

router.patch('/:id/tenants/:tenantId', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await updateContractTenant(
    req.params.id,
    req.params.tenantId,
    parseBody(contractTenantUpdateSchema, req.body),
    req.auth!.userId
  ));
}));

router.delete('/:id/tenants/:tenantId', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const filters = parseQuery(participantRemovalQuerySchema, req.query);
  await removeContractTenant(req.params.id, req.params.tenantId, filters.left_at, req.auth!.userId);
  res.status(204).send();
}));

export default router;
