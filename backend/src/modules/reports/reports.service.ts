import { query } from '../../db';
import { AppError } from '../../shared/errors/app-error';

type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE';
type ReportSection = 'revenue' | 'debt' | 'occupancy';

export interface ReportsFilters {
  monthFrom?: string;
  monthTo?: string;
  buildingId?: string;
  status?: InvoiceStatus;
}

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
  unpaid: number | string | null;
}

interface RevenueBuildingRow {
  building_id: string;
  building_name: string;
  invoice_count: number;
  billed: number | string | null;
  collected: number | string | null;
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

const invoiceBalanceCte = `
  paid AS (
    SELECT p.invoice_id, COALESCE(SUM(p.amount), 0) AS amount
    FROM payment p
    JOIN scoped_invoices si ON si.id=p.invoice_id
    WHERE p.status='SUCCEEDED'
    GROUP BY p.invoice_id
  ),
  invoice_balances AS (
    SELECT
      si.*,
      LEAST(COALESCE(paid.amount, CASE WHEN si.status='PAID' THEN si.total ELSE 0 END), si.total) AS paid_amount,
      CASE
        WHEN si.status='VOID' THEN 0
        ELSE GREATEST(si.total - LEAST(COALESCE(paid.amount, CASE WHEN si.status='PAID' THEN si.total ELSE 0 END), si.total), 0)
      END AS outstanding_amount
    FROM scoped_invoices si
    LEFT JOIN paid ON paid.invoice_id=si.id
  )
`;

const toNumber = (value: unknown): number => {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

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
  unpaid: toNumber(row.unpaid)
});

const mapRevenueBuilding = (row: RevenueBuildingRow) => ({
  buildingId: row.building_id,
  buildingName: row.building_name,
  invoiceCount: row.invoice_count,
  billed: toNumber(row.billed),
  collected: toNumber(row.collected),
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
  outstandingAmount: toNumber(row.outstanding_amount)
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
       COUNT(ib.id)::int AS invoice_count,
       COALESCE(SUM(ib.total) FILTER (WHERE ib.status <> 'VOID'), 0)::float AS billed,
       COALESCE(SUM(ib.paid_amount), 0)::float AS collected,
       COALESCE(SUM(ib.outstanding_amount) FILTER (WHERE ib.status IN ('ISSUED', 'OVERDUE')), 0)::float AS unpaid
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
       COUNT(ib.id)::int AS invoice_count,
       COALESCE(SUM(ib.total) FILTER (WHERE ib.status <> 'VOID'), 0)::float AS billed,
       COALESCE(SUM(ib.paid_amount), 0)::float AS collected,
       COALESCE(SUM(ib.outstanding_amount) FILTER (WHERE ib.status IN ('ISSUED', 'OVERDUE')), 0)::float AS unpaid
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
       outstanding_amount::float
     FROM invoice_balances
     WHERE status IN ('ISSUED', 'OVERDUE')
       AND outstanding_amount > 0
     ORDER BY status='OVERDUE' DESC, due_date NULLS LAST, month DESC, building_name, room_code`,
    scope.params
  );

  return rows.map(mapDebtRow);
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

const escapeCsv = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const toCsv = (headers: string[], rows: unknown[][]): string =>
  [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(','))
  ].join('\n');

export const getReportsData = async (managerId: string, filters: ReportsFilters) => {
  const normalizedFilters = normalizeFilters(filters);
  await ensureBuildingBelongsToManager(managerId, normalizedFilters.buildingId);

  const [revenueByMonth, revenueByBuilding, debtItems, occupancyByBuilding] = await Promise.all([
    getRevenueByMonth(managerId, normalizedFilters),
    getRevenueByBuilding(managerId, normalizedFilters),
    getDebtItems(managerId, normalizedFilters),
    getOccupancyByBuilding(managerId, normalizedFilters)
  ]);

  const revenueSummary = revenueByMonth.reduce(
    (acc, item) => ({
      billed: acc.billed + item.billed,
      collected: acc.collected + item.collected,
      unpaid: acc.unpaid + item.unpaid,
      invoiceCount: acc.invoiceCount + item.invoiceCount
    }),
    { billed: 0, collected: 0, unpaid: 0, invoiceCount: 0 }
  );

  const debtSummary = debtItems.reduce(
    (acc, item) => ({
      unpaidInvoices: acc.unpaidInvoices + 1,
      unpaidAmount: acc.unpaidAmount + item.outstandingAmount,
      overdueInvoices: acc.overdueInvoices + (item.status === 'OVERDUE' ? 1 : 0),
      overdueAmount: acc.overdueAmount + (item.status === 'OVERDUE' ? item.outstandingAmount : 0)
    }),
    { unpaidInvoices: 0, unpaidAmount: 0, overdueInvoices: 0, overdueAmount: 0 }
  );

  const occupancyTotals = occupancyByBuilding.reduce(
    (acc, item) => ({
      totalRooms: acc.totalRooms + item.totalRooms,
      occupiedRooms: acc.occupiedRooms + item.occupiedRooms,
      vacantRooms: acc.vacantRooms + item.vacantRooms,
      activeTenants: acc.activeTenants + item.activeTenants
    }),
    { totalRooms: 0, occupiedRooms: 0, vacantRooms: 0, activeTenants: 0 }
  );

  return {
    filters: normalizedFilters,
    summary: {
      ...revenueSummary,
      ...debtSummary,
      ...occupancyTotals,
      occupancyRate: occupancyTotals.totalRooms === 0
        ? 0
        : Math.round((occupancyTotals.occupiedRooms / occupancyTotals.totalRooms) * 100)
    },
    revenueByMonth,
    revenueByBuilding,
    debtSummary,
    debtItems,
    occupancyByBuilding
  };
};

export const getReportsCsv = async (managerId: string, filters: ReportsFilters, section: ReportSection) => {
  const data = await getReportsData(managerId, filters);

  if (section === 'revenue') {
    return {
      filename: `reports-revenue-${data.filters.monthFrom.slice(0, 7)}-${data.filters.monthTo.slice(0, 7)}.csv`,
      content: toCsv(
        ['Month', 'Invoice count', 'Billed', 'Collected', 'Unpaid'],
        data.revenueByMonth.map((item) => [item.month, item.invoiceCount, item.billed, item.collected, item.unpaid])
      )
    };
  }

  if (section === 'debt') {
    return {
      filename: `reports-debt-${data.filters.monthFrom.slice(0, 7)}-${data.filters.monthTo.slice(0, 7)}.csv`,
      content: toCsv(
        ['Building', 'Room', 'Tenant', 'Month', 'Status', 'Due date', 'Total', 'Paid', 'Outstanding'],
        data.debtItems.map((item) => [
          item.buildingName,
          item.roomCode,
          item.tenantName,
          item.month.slice(0, 7),
          item.status,
          item.dueDate ?? '',
          item.total,
          item.paidAmount,
          item.outstandingAmount
        ])
      )
    };
  }

  return {
    filename: `reports-occupancy-${data.filters.monthTo.slice(0, 7)}.csv`,
    content: toCsv(
      ['Building', 'Total rooms', 'Occupied', 'Vacant', 'Maintenance', 'Inactive', 'Active tenants', 'Occupancy rate'],
      data.occupancyByBuilding.map((item) => [
        item.buildingName,
        item.totalRooms,
        item.occupiedRooms,
        item.vacantRooms,
        item.maintenanceRooms,
        item.inactiveRooms,
        item.activeTenants,
        `${item.occupancyRate}%`
      ])
    )
  };
};
