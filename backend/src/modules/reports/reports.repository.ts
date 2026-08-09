import { query } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { toDatabaseNumber, type DatabaseNumeric, type InvoiceStatus } from '../../shared/types/database';
import {
  paginationOffset,
  sqlSortDirection,
  type PaginatedResult,
  type PaginationParams
} from '../../shared/utils/pagination';


export interface ReportsFilters {
  monthFrom?: string;
  monthTo?: string;
  buildingId?: string;
  status?: InvoiceStatus;
}

export type ReportDetailSection = 'revenue' | 'debt' | 'occupancy';
export type ReportDetailSortBy =
  | 'building'
  | 'month'
  | 'invoiceCount'
  | 'billed'
  | 'collected'
  | 'unpaid'
  | 'dueDate'
  | 'outstandingAmount'
  | 'totalRooms'
  | 'occupiedRooms'
  | 'vacantRooms'
  | 'activeTenants'
  | 'occupancyRate';
export type ReportDetailPagination = PaginationParams<ReportDetailSortBy>;

interface NormalizedReportsFilters {
  monthFrom: string;
  monthTo: string;
  buildingId?: string;
  status?: InvoiceStatus;
}

interface InvoiceScope {
  where: string;
  params: unknown[];
}

interface RevenueMonthRow {
  month: string;
  invoice_count: number;
  billed: number | string | null;
  collected: number | string | null;
  gross_payments: number | string | null;
  reversals: number | string | null;
  unpaid: number | string | null;
}

interface RevenueBuildingRow {
  building_id: string;
  building_name: string;
  invoice_count: number;
  billed: number | string | null;
  collected: number | string | null;
  gross_payments: number | string | null;
  reversals: number | string | null;
  unpaid: number | string | null;
}

interface DebtRow {
  invoice_id: string;
  building_id: string;
  building_name: string;
  room_id: string;
  room_code: string;
  tenant_name: string | null;
  month: string;
  status: InvoiceStatus;
  due_date: string | null;
  total: number | string | null;
  paid_amount: number | string | null;
  outstanding_amount: number | string | null;
  is_overdue: boolean;
}

interface OccupancyRow {
  building_id: string;
  building_name: string;
  total_rooms: number;
  occupied_rooms: number;
  vacant_rooms: number;
  maintenance_rooms: number;
  inactive_rooms: number;
  active_tenants: number;
}

interface DebtSummaryRow {
  unpaid_invoices: number;
  unpaid_amount: number | string | null;
  overdue_invoices: number;
  overdue_amount: number | string | null;
}

interface OccupancySummaryRow {
  total_rooms: number;
  occupied_rooms: number;
  vacant_rooms: number;
  active_tenants: number;
}

const invoiceBalanceCte = `
  paid AS (
    SELECT
      p.invoice_id,
      COALESCE(SUM(CASE WHEN p.entry_type='REVERSAL' THEN -p.amount ELSE p.amount END), 0) AS amount,
      COALESCE(SUM(p.amount) FILTER (WHERE p.entry_type='PAYMENT'), 0) AS gross_payments,
      COALESCE(SUM(p.amount) FILTER (WHERE p.entry_type='REVERSAL'), 0) AS reversals
    FROM payment p
    JOIN scoped_invoices si ON si.id=p.invoice_id
    WHERE p.status='SUCCEEDED'
    GROUP BY p.invoice_id
  ),
  invoice_balances AS (
    SELECT
      si.id, si.month, si.status, si.total, si.due_date, si.created_at,
      si.building_id, si.building_name, si.room_id, si.room_code, si.tenant_name,
      LEAST(COALESCE(paid.amount, CASE WHEN si.status='PAID' THEN si.total ELSE 0 END), si.total) AS paid_amount,
      COALESCE(paid.gross_payments, CASE WHEN si.status='PAID' THEN si.total ELSE 0 END) AS gross_payments,
      COALESCE(paid.reversals, 0) AS reversals,
      CASE
        WHEN si.status='VOID' THEN 0
        ELSE GREATEST(si.total - LEAST(COALESCE(paid.amount, CASE WHEN si.status='PAID' THEN si.total ELSE 0 END), si.total), 0)
      END AS outstanding_amount
    FROM scoped_invoices si
    LEFT JOIN paid ON paid.invoice_id=si.id
  )
`;

const toNumber = (value: DatabaseNumeric | null | undefined): number => toDatabaseNumber(value);

const normalizeMonth = (value: string | undefined, fallback: Date): string => {
  if (!value) {
    return `${fallback.getUTCFullYear()}-${String(fallback.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value);
  if (!match) {
    throw new AppError(400, 'month filters must use YYYY-MM or YYYY-MM-DD format', 'VALIDATION_ERROR');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new AppError(400, 'month must be between 01 and 12', 'VALIDATION_ERROR');
  }

  return `${year}-${String(month).padStart(2, '0')}-01`;
};

const normalizeFilters = (filters: ReportsFilters): NormalizedReportsFilters => {
  const now = new Date();
  const fromFallback = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const toFallback = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthFrom = normalizeMonth(filters.monthFrom, fromFallback);
  const monthTo = normalizeMonth(filters.monthTo, toFallback);

  if (Date.parse(monthFrom) > Date.parse(monthTo)) {
    throw new AppError(400, 'month_from must be before or equal to month_to', 'VALIDATION_ERROR');
  }

  return {
    monthFrom,
    monthTo,
    buildingId: filters.buildingId,
    status: filters.status
  };
};

const scopedBuildingWhere = (buildingId?: string): string =>
  `b.manager_user_id=$1${buildingId ? ' AND b.id=$2' : ''}`;

const scopedBuildingParams = (managerId: string, buildingId?: string): unknown[] =>
  buildingId ? [managerId, buildingId] : [managerId];

const scopedBuildingWhereFromInvoiceScope = (filters: NormalizedReportsFilters): string =>
  `b.manager_user_id=$1${filters.buildingId ? ' AND b.id=$4' : ''}`;

const ensureBuildingBelongsToManager = async (managerId: string, buildingId?: string) => {
  if (!buildingId) return;

  const { rows } = await query<{ id: string }>(
    'SELECT id FROM building WHERE id=$1 AND manager_user_id=$2 LIMIT 1',
    [buildingId, managerId]
  );

  if (!rows[0]) {
    throw new AppError(404, 'Building not found', 'BUILDING_NOT_FOUND');
  }
};

const buildInvoiceScope = (managerId: string, filters: NormalizedReportsFilters): InvoiceScope => {
  const params: unknown[] = [managerId, filters.monthFrom, filters.monthTo];
  const conditions = [
    'b.manager_user_id=$1',
    'i.month >= $2::date',
    'i.month <= $3::date'
  ];

  if (filters.buildingId) {
    params.push(filters.buildingId);
    conditions.push(`b.id=$${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`i.status=$${params.length}`);
  }

  return {
    where: conditions.join(' AND '),
    params
  };
};

const scopedInvoiceCte = (scope: InvoiceScope): string => `
  scoped_invoices AS (
    SELECT
      i.id,
      i.month,
      i.status,
      i.total,
      i.due_date,
      i.created_at,
      b.id AS building_id,
      b.name AS building_name,
      r.id AS room_id,
      r.code AS room_code,
      tenant.full_name AS tenant_name
    FROM invoice i
    JOIN room r ON r.id=i.room_id
    JOIN building b ON b.id=r.building_id
    LEFT JOIN LATERAL (
      SELECT t.full_name
      FROM contract_tenant ct
      JOIN tenant t ON t.id=ct.tenant_id
      WHERE ct.contract_id=i.contract_id AND ct.left_at IS NULL
      ORDER BY ct.is_primary DESC, ct.joined_at DESC
      LIMIT 1
    ) tenant ON true
    WHERE ${scope.where}
  )
`;

const mapRevenueMonth = (row: RevenueMonthRow) => ({
  month: row.month,
  invoiceCount: row.invoice_count,
  billed: toNumber(row.billed),
  collected: toNumber(row.collected),
  grossPayments: toNumber(row.gross_payments),
  reversals: toNumber(row.reversals),
  unpaid: toNumber(row.unpaid)
});

const mapRevenueBuilding = (row: RevenueBuildingRow) => ({
  buildingId: row.building_id,
  buildingName: row.building_name,
  invoiceCount: row.invoice_count,
  billed: toNumber(row.billed),
  collected: toNumber(row.collected),
  grossPayments: toNumber(row.gross_payments),
  reversals: toNumber(row.reversals),
  unpaid: toNumber(row.unpaid)
});

const mapDebtRow = (row: DebtRow) => ({
  invoiceId: row.invoice_id,
  buildingId: row.building_id,
  buildingName: row.building_name,
  roomId: row.room_id,
  roomCode: row.room_code,
  tenantName: row.tenant_name ?? '-',
  month: row.month,
  status: row.status,
  dueDate: row.due_date,
  total: toNumber(row.total),
  paidAmount: toNumber(row.paid_amount),
  outstandingAmount: toNumber(row.outstanding_amount),
  isOverdue: row.is_overdue
});

const mapOccupancyRow = (row: OccupancyRow) => {
  const totalRooms = row.total_rooms;
  const occupiedRooms = row.occupied_rooms;

  return {
    buildingId: row.building_id,
    buildingName: row.building_name,
    totalRooms,
    occupiedRooms,
    vacantRooms: row.vacant_rooms,
    maintenanceRooms: row.maintenance_rooms,
    inactiveRooms: row.inactive_rooms,
    activeTenants: row.active_tenants,
    occupancyRate: totalRooms === 0 ? 0 : Math.round((occupiedRooms / totalRooms) * 100)
  };
};

const getRevenueByMonth = async (managerId: string, filters: NormalizedReportsFilters) => {
  const scope = buildInvoiceScope(managerId, filters);
  const { rows } = await query<RevenueMonthRow>(
    `WITH month_series AS (
       SELECT generate_series($2::date, $3::date, interval '1 month')::date AS month_start
     ),
     ${scopedInvoiceCte(scope)},
     ${invoiceBalanceCte}
     SELECT
       to_char(ms.month_start, 'YYYY-MM') AS month,
       COUNT(ib.id) FILTER (WHERE ib.status <> 'VOID')::int AS invoice_count,
       COALESCE(SUM(ib.total) FILTER (WHERE ib.status <> 'VOID'), 0)::float AS billed,
       COALESCE(SUM(ib.paid_amount), 0)::float AS collected,
       COALESCE(SUM(ib.gross_payments), 0)::float AS gross_payments,
       COALESCE(SUM(ib.reversals), 0)::float AS reversals,
       COALESCE(SUM(ib.outstanding_amount) FILTER (WHERE ib.status IN ('ISSUED', 'PARTIALLY_PAID')), 0)::float AS unpaid
     FROM month_series ms
     LEFT JOIN invoice_balances ib ON ib.month=ms.month_start
     GROUP BY ms.month_start
     ORDER BY ms.month_start`,
    scope.params
  );

  return rows.map(mapRevenueMonth);
};

const getRevenueByBuilding = async (managerId: string, filters: NormalizedReportsFilters) => {
  const scope = buildInvoiceScope(managerId, filters);

  const { rows } = await query<RevenueBuildingRow>(
    `WITH scoped_buildings AS (
       SELECT b.id, b.name
       FROM building b
       WHERE ${scopedBuildingWhereFromInvoiceScope(filters)}
     ),
     ${scopedInvoiceCte(scope)},
     ${invoiceBalanceCte}
     SELECT
       sb.id AS building_id,
       sb.name AS building_name,
       COUNT(ib.id) FILTER (WHERE ib.status <> 'VOID')::int AS invoice_count,
       COALESCE(SUM(ib.total) FILTER (WHERE ib.status <> 'VOID'), 0)::float AS billed,
       COALESCE(SUM(ib.paid_amount), 0)::float AS collected,
       COALESCE(SUM(ib.gross_payments), 0)::float AS gross_payments,
       COALESCE(SUM(ib.reversals), 0)::float AS reversals,
       COALESCE(SUM(ib.outstanding_amount) FILTER (WHERE ib.status IN ('ISSUED', 'PARTIALLY_PAID')), 0)::float AS unpaid
     FROM scoped_buildings sb
     LEFT JOIN invoice_balances ib ON ib.building_id=sb.id
     GROUP BY sb.id, sb.name
     ORDER BY billed DESC, sb.name`,
    scope.params
  );

  return rows.map(mapRevenueBuilding);
};

const getDebtItems = async (managerId: string, filters: NormalizedReportsFilters) => {
  const scope = buildInvoiceScope(managerId, filters);
  const { rows } = await query<DebtRow>(
    `WITH ${scopedInvoiceCte(scope)},
     ${invoiceBalanceCte}
     SELECT
       id AS invoice_id,
       building_id,
       building_name,
       room_id,
       room_code,
       tenant_name,
       month,
       status,
       due_date,
       total::float,
       paid_amount::float,
       outstanding_amount::float,
       (due_date IS NOT NULL AND due_date < CURRENT_DATE) AS is_overdue
     FROM invoice_balances
     WHERE status IN ('ISSUED', 'PARTIALLY_PAID')
       AND outstanding_amount > 0
     ORDER BY is_overdue DESC, due_date NULLS LAST, month DESC, building_name, room_code`,
    scope.params
  );

  return rows.map(mapDebtRow);
};

const getDebtSummary = async (managerId: string, filters: NormalizedReportsFilters) => {
  const scope = buildInvoiceScope(managerId, filters);
  const { rows } = await query<DebtSummaryRow>(
    `WITH ${scopedInvoiceCte(scope)},
     ${invoiceBalanceCte}
     SELECT
       COUNT(*) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND outstanding_amount > 0)::int AS unpaid_invoices,
       COALESCE(SUM(outstanding_amount) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND outstanding_amount > 0), 0)::float AS unpaid_amount,
       COUNT(*) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND outstanding_amount > 0 AND due_date < CURRENT_DATE)::int AS overdue_invoices,
       COALESCE(SUM(outstanding_amount) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND outstanding_amount > 0 AND due_date < CURRENT_DATE), 0)::float AS overdue_amount
     FROM invoice_balances`,
    scope.params
  );
  const row = rows[0];
  return {
    unpaidInvoices: row?.unpaid_invoices ?? 0,
    unpaidAmount: toNumber(row?.unpaid_amount),
    overdueInvoices: row?.overdue_invoices ?? 0,
    overdueAmount: toNumber(row?.overdue_amount)
  };
};

const getOccupancyByBuilding = async (managerId: string, filters: NormalizedReportsFilters) => {
  const { rows } = await query<OccupancyRow>(
    `WITH active_room AS (
       SELECT c.room_id, COUNT(DISTINCT ct.tenant_id)::int AS active_tenants
       FROM contract c
       LEFT JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
       WHERE c.status='ACTIVE'
       GROUP BY c.room_id
     )
     SELECT
       b.id AS building_id,
       b.name AS building_name,
       COUNT(r.id)::int AS total_rooms,
       COUNT(r.id) FILTER (WHERE ar.room_id IS NOT NULL)::int AS occupied_rooms,
       COUNT(r.id) FILTER (WHERE ar.room_id IS NULL AND r.status='ACTIVE')::int AS vacant_rooms,
       COUNT(r.id) FILTER (WHERE ar.room_id IS NULL AND r.status='MAINTENANCE')::int AS maintenance_rooms,
       COUNT(r.id) FILTER (WHERE ar.room_id IS NULL AND r.status='INACTIVE')::int AS inactive_rooms,
       COALESCE(SUM(ar.active_tenants), 0)::int AS active_tenants
     FROM building b
     LEFT JOIN room r ON r.building_id=b.id
     LEFT JOIN active_room ar ON ar.room_id=r.id
     WHERE ${scopedBuildingWhere(filters.buildingId)}
     GROUP BY b.id, b.name
     ORDER BY occupied_rooms DESC, b.name`,
    scopedBuildingParams(managerId, filters.buildingId)
  );

  return rows.map(mapOccupancyRow);
};

const getOccupancySummary = async (managerId: string, filters: NormalizedReportsFilters) => {
  const { rows } = await query<OccupancySummaryRow>(
    `WITH active_room AS (
       SELECT c.room_id, COUNT(DISTINCT ct.tenant_id)::int AS active_tenants
       FROM contract c
       LEFT JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
       WHERE c.status='ACTIVE'
       GROUP BY c.room_id
     )
     SELECT
       COUNT(r.id)::int AS total_rooms,
       COUNT(r.id) FILTER (WHERE ar.room_id IS NOT NULL)::int AS occupied_rooms,
       COUNT(r.id) FILTER (WHERE ar.room_id IS NULL AND r.status='ACTIVE')::int AS vacant_rooms,
       COALESCE(SUM(ar.active_tenants), 0)::int AS active_tenants
     FROM building b
     LEFT JOIN room r ON r.building_id=b.id
     LEFT JOIN active_room ar ON ar.room_id=r.id
     WHERE ${scopedBuildingWhere(filters.buildingId)}`,
    scopedBuildingParams(managerId, filters.buildingId)
  );
  const row = rows[0];
  return {
    totalRooms: row?.total_rooms ?? 0,
    occupiedRooms: row?.occupied_rooms ?? 0,
    vacantRooms: row?.vacant_rooms ?? 0,
    activeTenants: row?.active_tenants ?? 0
  };
};

export const loadReportRows = async (managerId: string, filters: ReportsFilters) => {
  const normalizedFilters = normalizeFilters(filters);
  await ensureBuildingBelongsToManager(managerId, normalizedFilters.buildingId);

  const [revenueByMonth, revenueByBuilding, debtItems, occupancyByBuilding] = await Promise.all([
    getRevenueByMonth(managerId, normalizedFilters),
    getRevenueByBuilding(managerId, normalizedFilters),
    getDebtItems(managerId, normalizedFilters),
    getOccupancyByBuilding(managerId, normalizedFilters)
  ]);

  return {
    filters: normalizedFilters,
    revenueByMonth,
    revenueByBuilding,
    debtItems,
    occupancyByBuilding
  };
};

export const loadReportSummaryRows = async (managerId: string, filters: ReportsFilters) => {
  const normalizedFilters = normalizeFilters(filters);
  await ensureBuildingBelongsToManager(managerId, normalizedFilters.buildingId);
  const [revenueByMonth, debtSummary, occupancySummary] = await Promise.all([
    getRevenueByMonth(managerId, normalizedFilters),
    getDebtSummary(managerId, normalizedFilters),
    getOccupancySummary(managerId, normalizedFilters)
  ]);
  return { filters: normalizedFilters, revenueByMonth, debtSummary, occupancySummary };
};

const revenueDetailSortColumns: Partial<Record<ReportDetailSortBy, string>> = {
  building: 'building_name',
  invoiceCount: 'invoice_count',
  billed: 'billed',
  collected: 'collected',
  unpaid: 'unpaid'
};

const debtDetailSortColumns: Partial<Record<ReportDetailSortBy, string>> = {
  building: 'building_name',
  month: 'month',
  dueDate: 'due_date',
  outstandingAmount: 'outstanding_amount'
};

const occupancyDetailSortColumns: Partial<Record<ReportDetailSortBy, string>> = {
  building: 'building_name',
  totalRooms: 'total_rooms',
  occupiedRooms: 'occupied_rooms',
  vacantRooms: 'vacant_rooms',
  activeTenants: 'active_tenants',
  occupancyRate: '(COUNT(r.id) FILTER (WHERE ar.room_id IS NOT NULL)::numeric / NULLIF(COUNT(r.id), 0))'
};

const paginatedRevenueByBuilding = async (
  managerId: string,
  filters: NormalizedReportsFilters,
  pagination: ReportDetailPagination
): Promise<PaginatedResult<ReturnType<typeof mapRevenueBuilding>>> => {
  const scope = buildInvoiceScope(managerId, filters);
  const itemParams = [...scope.params, pagination.pageSize, paginationOffset(pagination)];
  const sortColumn = revenueDetailSortColumns[pagination.sortBy] ?? 'billed';
  const [countResult, itemResult] = await Promise.all([
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM building b WHERE ${scopedBuildingWhere(filters.buildingId)}`,
      scopedBuildingParams(managerId, filters.buildingId)
    ),
    query<RevenueBuildingRow>(
      `WITH scoped_buildings AS (
         SELECT b.id, b.name
         FROM building b
         WHERE ${scopedBuildingWhereFromInvoiceScope(filters)}
       ),
       ${scopedInvoiceCte(scope)},
       ${invoiceBalanceCte}
       SELECT
         sb.id AS building_id,
         sb.name AS building_name,
         COUNT(ib.id) FILTER (WHERE ib.status <> 'VOID')::int AS invoice_count,
         COALESCE(SUM(ib.total) FILTER (WHERE ib.status <> 'VOID'), 0)::float AS billed,
         COALESCE(SUM(ib.paid_amount), 0)::float AS collected,
         COALESCE(SUM(ib.gross_payments), 0)::float AS gross_payments,
         COALESCE(SUM(ib.reversals), 0)::float AS reversals,
         COALESCE(SUM(ib.outstanding_amount) FILTER (WHERE ib.status IN ('ISSUED', 'PARTIALLY_PAID')), 0)::float AS unpaid
       FROM scoped_buildings sb
       LEFT JOIN invoice_balances ib ON ib.building_id=sb.id
       GROUP BY sb.id, sb.name
       ORDER BY ${sortColumn} ${sqlSortDirection(pagination.sortOrder)} NULLS LAST, sb.name, sb.id
       LIMIT $${itemParams.length - 1} OFFSET $${itemParams.length}`,
      itemParams
    )
  ]);
  return {
    total: countResult.rows[0]?.total ?? 0,
    page: pagination.page,
    pageSize: pagination.pageSize,
    items: itemResult.rows.map(mapRevenueBuilding)
  };
};

const paginatedDebtItems = async (
  managerId: string,
  filters: NormalizedReportsFilters,
  pagination: ReportDetailPagination
): Promise<PaginatedResult<ReturnType<typeof mapDebtRow>>> => {
  const scope = buildInvoiceScope(managerId, filters);
  const itemParams = [...scope.params, pagination.pageSize, paginationOffset(pagination)];
  const sortColumn = debtDetailSortColumns[pagination.sortBy] ?? 'due_date';
  const debtWhere = `status IN ('ISSUED', 'PARTIALLY_PAID') AND outstanding_amount > 0`;
  const [countResult, itemResult] = await Promise.all([
    query<{ total: number }>(
      `WITH ${scopedInvoiceCte(scope)}, ${invoiceBalanceCte}
       SELECT COUNT(*)::int AS total FROM invoice_balances WHERE ${debtWhere}`,
      scope.params
    ),
    query<DebtRow>(
      `WITH ${scopedInvoiceCte(scope)}, ${invoiceBalanceCte}
       SELECT
         id AS invoice_id, building_id, building_name, room_id, room_code, tenant_name,
         month, status, due_date, total::float, paid_amount::float, outstanding_amount::float,
         (due_date IS NOT NULL AND due_date < CURRENT_DATE) AS is_overdue
       FROM invoice_balances
       WHERE ${debtWhere}
       ORDER BY ${sortColumn} ${sqlSortDirection(pagination.sortOrder)} NULLS LAST, month DESC, id
       LIMIT $${itemParams.length - 1} OFFSET $${itemParams.length}`,
      itemParams
    )
  ]);
  return {
    total: countResult.rows[0]?.total ?? 0,
    page: pagination.page,
    pageSize: pagination.pageSize,
    items: itemResult.rows.map(mapDebtRow)
  };
};

const paginatedOccupancyByBuilding = async (
  managerId: string,
  filters: NormalizedReportsFilters,
  pagination: ReportDetailPagination
): Promise<PaginatedResult<ReturnType<typeof mapOccupancyRow>>> => {
  const baseParams = scopedBuildingParams(managerId, filters.buildingId);
  const itemParams = [...baseParams, pagination.pageSize, paginationOffset(pagination)];
  const sortColumn = occupancyDetailSortColumns[pagination.sortBy] ?? occupancyDetailSortColumns.occupancyRate!;
  const [countResult, itemResult] = await Promise.all([
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM building b WHERE ${scopedBuildingWhere(filters.buildingId)}`,
      baseParams
    ),
    query<OccupancyRow>(
      `WITH active_room AS (
         SELECT c.room_id, COUNT(DISTINCT ct.tenant_id)::int AS active_tenants
         FROM contract c
         LEFT JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
         WHERE c.status='ACTIVE'
         GROUP BY c.room_id
       )
       SELECT
         b.id AS building_id, b.name AS building_name,
         COUNT(r.id)::int AS total_rooms,
         COUNT(r.id) FILTER (WHERE ar.room_id IS NOT NULL)::int AS occupied_rooms,
         COUNT(r.id) FILTER (WHERE ar.room_id IS NULL AND r.status='ACTIVE')::int AS vacant_rooms,
         COUNT(r.id) FILTER (WHERE ar.room_id IS NULL AND r.status='MAINTENANCE')::int AS maintenance_rooms,
         COUNT(r.id) FILTER (WHERE ar.room_id IS NULL AND r.status='INACTIVE')::int AS inactive_rooms,
         COALESCE(SUM(ar.active_tenants), 0)::int AS active_tenants
       FROM building b
       LEFT JOIN room r ON r.building_id=b.id
       LEFT JOIN active_room ar ON ar.room_id=r.id
       WHERE ${scopedBuildingWhere(filters.buildingId)}
       GROUP BY b.id, b.name
       ORDER BY ${sortColumn} ${sqlSortDirection(pagination.sortOrder)} NULLS LAST, b.name, b.id
       LIMIT $${itemParams.length - 1} OFFSET $${itemParams.length}`,
      itemParams
    )
  ]);
  return {
    total: countResult.rows[0]?.total ?? 0,
    page: pagination.page,
    pageSize: pagination.pageSize,
    items: itemResult.rows.map(mapOccupancyRow)
  };
};

export const loadReportDetailRows = async (
  managerId: string,
  filters: ReportsFilters,
  section: ReportDetailSection,
  pagination: ReportDetailPagination
) => {
  const normalizedFilters = normalizeFilters(filters);
  await ensureBuildingBelongsToManager(managerId, normalizedFilters.buildingId);

  switch (section) {
    case 'revenue': return paginatedRevenueByBuilding(managerId, normalizedFilters, pagination);
    case 'debt': return paginatedDebtItems(managerId, normalizedFilters, pagination);
    case 'occupancy': return paginatedOccupancyByBuilding(managerId, normalizedFilters, pagination);
  }
};
