import { query } from '../../db';
import { AppError } from '../../shared/errors/app-error';

type InvoiceStatus = 'ISSUED' | 'OVERDUE';

interface DashboardFilters {
  month?: string;
  buildingId?: string;
}

interface PortfolioStatsRow {
  total_buildings: number;
  total_rooms: number;
  occupied_rooms: number;
  vacant_rooms: number;
  maintenance_rooms: number;
  inactive_rooms: number;
}

interface TenantCountRow {
  total_tenants: number;
}

interface MonthlyRevenueRow {
  monthly_revenue: number | string | null;
}

interface InvoiceBalanceRow {
  unpaid_invoices: number;
  unpaid_amount: number | string | null;
  overdue_invoices: number;
  overdue_amount: number | string | null;
}

interface MonthlyRevenueChartRow {
  month: string;
  billed: number | string | null;
  collected: number | string | null;
  unpaid: number | string | null;
}

interface BuildingDistributionRow {
  building_id: string;
  building_name: string;
  total_rooms: number;
  occupied_rooms: number;
}

interface RecentTenantRow {
  id: string;
  full_name: string;
  room_code: string | null;
  building_name: string | null;
  contract_code: string | null;
  created_at: string;
  status: 'ACTIVE' | 'MOVED_OUT' | 'BLACKLIST';
}

interface RecentUnpaidInvoiceRow {
  id: string;
  room_code: string;
  building_name: string;
  month: string;
  status: InvoiceStatus;
  total: number | string | null;
}

const roomStatusColors = {
  occupied: '#1677ff',
  vacant: '#52c41a',
  maintenance: '#faad14',
  inactive: '#bfbfbf'
};

const toNumber = (value: unknown): number => {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const normalizeMonth = (value?: string): string => {
  if (!value) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value);
  if (!match) {
    throw new AppError(400, 'month must use YYYY-MM or YYYY-MM-DD format', 'VALIDATION_ERROR');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new AppError(400, 'month must be between 01 and 12', 'VALIDATION_ERROR');
  }

  return `${year}-${String(month).padStart(2, '0')}-01`;
};

const scopedParams = (managerId: string, buildingId?: string): unknown[] =>
  buildingId ? [managerId, buildingId] : [managerId];

const scopedBuildingWhere = (buildingId?: string): string =>
  `b.manager_user_id=$1${buildingId ? ' AND b.id=$2' : ''}`;

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

const getPortfolioStats = async (managerId: string, buildingId?: string): Promise<PortfolioStatsRow> => {
  const { rows } = await query<PortfolioStatsRow>(
    `WITH active_contract AS (
       SELECT DISTINCT room_id
       FROM contract
       WHERE status='ACTIVE'
     )
     SELECT
       COUNT(DISTINCT b.id)::int AS total_buildings,
       COUNT(r.id)::int AS total_rooms,
       COUNT(r.id) FILTER (WHERE ac.room_id IS NOT NULL)::int AS occupied_rooms,
       COUNT(r.id) FILTER (WHERE ac.room_id IS NULL AND r.status='ACTIVE')::int AS vacant_rooms,
       COUNT(r.id) FILTER (WHERE ac.room_id IS NULL AND r.status='MAINTENANCE')::int AS maintenance_rooms,
       COUNT(r.id) FILTER (WHERE ac.room_id IS NULL AND r.status='INACTIVE')::int AS inactive_rooms
     FROM building b
     LEFT JOIN room r ON r.building_id=b.id
     LEFT JOIN active_contract ac ON ac.room_id=r.id
     WHERE ${scopedBuildingWhere(buildingId)}`,
    scopedParams(managerId, buildingId)
  );

  return rows[0] ?? {
    total_buildings: 0,
    total_rooms: 0,
    occupied_rooms: 0,
    vacant_rooms: 0,
    maintenance_rooms: 0,
    inactive_rooms: 0
  };
};

const getTenantCount = async (managerId: string, buildingId?: string): Promise<number> => {
  if (buildingId) {
    const { rows } = await query<TenantCountRow>(
      `SELECT COUNT(DISTINCT t.id)::int AS total_tenants
       FROM tenant t
       JOIN contract_tenant ct ON ct.tenant_id=t.id AND ct.left_at IS NULL
       JOIN contract c ON c.id=ct.contract_id AND c.status='ACTIVE'
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ${scopedBuildingWhere(buildingId)}
         AND t.status <> 'DELETED'`,
      scopedParams(managerId, buildingId)
    );
    return rows[0]?.total_tenants ?? 0;
  }

  const { rows } = await query<TenantCountRow>(
    `SELECT COUNT(*)::int AS total_tenants
     FROM tenant t
     WHERE t.status <> 'DELETED'
       AND (
         NOT EXISTS (
           SELECT 1
           FROM contract_tenant ct_scope
           JOIN contract c_scope ON c_scope.id=ct_scope.contract_id
           WHERE ct_scope.tenant_id=t.id
             AND ct_scope.left_at IS NULL
             AND c_scope.status='ACTIVE'
         )
         OR EXISTS (
           SELECT 1
           FROM contract_tenant ct_scope
           JOIN contract c_scope ON c_scope.id=ct_scope.contract_id
           JOIN room r_scope ON r_scope.id=c_scope.room_id
           JOIN building b_scope ON b_scope.id=r_scope.building_id
           WHERE ct_scope.tenant_id=t.id
             AND ct_scope.left_at IS NULL
             AND c_scope.status='ACTIVE'
             AND b_scope.manager_user_id=$1
         )
       )`,
    [managerId]
  );

  return rows[0]?.total_tenants ?? 0;
};

const getMonthlyRevenue = async (managerId: string, month: string, buildingId?: string): Promise<number> => {
  const params = scopedParams(managerId, buildingId);
  params.push(month);
  const monthParam = params.length;

  const { rows } = await query<MonthlyRevenueRow>(
    `SELECT COALESCE(SUM(p.amount), 0)::float AS monthly_revenue
     FROM payment p
     JOIN invoice i ON i.id=p.invoice_id
     JOIN room r ON r.id=i.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ${scopedBuildingWhere(buildingId)}
       AND p.status='SUCCEEDED'
       AND COALESCE(p.paid_at, p.created_at) >= $${monthParam}::date
       AND COALESCE(p.paid_at, p.created_at) < ($${monthParam}::date + interval '1 month')`,
    params
  );

  return toNumber(rows[0]?.monthly_revenue);
};

const getInvoiceBalances = async (managerId: string, month: string, buildingId?: string): Promise<InvoiceBalanceRow> => {
  const params = scopedParams(managerId, buildingId);
  params.push(month);
  const monthParam = params.length;

  const { rows } = await query<InvoiceBalanceRow>(
    `WITH scoped_invoices AS (
       SELECT i.id, i.status, i.total
       FROM invoice i
       JOIN room r ON r.id=i.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ${scopedBuildingWhere(buildingId)}
         AND i.month=$${monthParam}::date
     ),
     paid AS (
       SELECT p.invoice_id, COALESCE(SUM(p.amount), 0) AS amount
       FROM payment p
       JOIN scoped_invoices si ON si.id=p.invoice_id
       WHERE p.status='SUCCEEDED'
       GROUP BY p.invoice_id
     ),
     balances AS (
       SELECT
         si.status,
         GREATEST(si.total - LEAST(COALESCE(paid.amount, CASE WHEN si.status='PAID' THEN si.total ELSE 0 END), si.total), 0) AS outstanding
       FROM scoped_invoices si
       LEFT JOIN paid ON paid.invoice_id=si.id
     )
     SELECT
       COUNT(*) FILTER (WHERE status IN ('ISSUED', 'OVERDUE') AND outstanding > 0)::int AS unpaid_invoices,
       COALESCE(SUM(outstanding) FILTER (WHERE status IN ('ISSUED', 'OVERDUE') AND outstanding > 0), 0)::float AS unpaid_amount,
       COUNT(*) FILTER (WHERE status='OVERDUE' AND outstanding > 0)::int AS overdue_invoices,
       COALESCE(SUM(outstanding) FILTER (WHERE status='OVERDUE' AND outstanding > 0), 0)::float AS overdue_amount
     FROM balances`,
    params
  );

  return rows[0] ?? {
    unpaid_invoices: 0,
    unpaid_amount: 0,
    overdue_invoices: 0,
    overdue_amount: 0
  };
};

const getMonthlyRevenueChart = async (
  managerId: string,
  month: string,
  buildingId?: string
): Promise<MonthlyRevenueChartRow[]> => {
  const params = scopedParams(managerId, buildingId);
  params.push(month);
  const monthParam = params.length;

  const { rows } = await query<MonthlyRevenueChartRow>(
    `WITH month_series AS (
       SELECT generate_series(($${monthParam}::date - interval '5 months')::date, $${monthParam}::date, interval '1 month')::date AS month_start
     ),
     scoped_invoices AS (
       SELECT i.id, i.month, i.status, i.total
       FROM invoice i
       JOIN room r ON r.id=i.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ${scopedBuildingWhere(buildingId)}
         AND i.month >= ($${monthParam}::date - interval '5 months')::date
         AND i.month <= $${monthParam}::date
     ),
     paid AS (
       SELECT p.invoice_id, COALESCE(SUM(p.amount), 0) AS amount
       FROM payment p
       JOIN scoped_invoices si ON si.id=p.invoice_id
       WHERE p.status='SUCCEEDED'
       GROUP BY p.invoice_id
     )
     SELECT
       to_char(ms.month_start, 'YYYY-MM') AS month,
       COALESCE(SUM(si.total), 0)::float AS billed,
       COALESCE(
         SUM(CASE WHEN si.status='PAID' THEN si.total ELSE LEAST(COALESCE(paid.amount, 0), si.total) END),
         0
       )::float AS collected,
       COALESCE(
         SUM(
           CASE
             WHEN si.status IN ('ISSUED', 'OVERDUE')
             THEN GREATEST(si.total - LEAST(COALESCE(paid.amount, 0), si.total), 0)
             ELSE 0
           END
         ),
         0
       )::float AS unpaid
     FROM month_series ms
     LEFT JOIN scoped_invoices si ON si.month=ms.month_start
     LEFT JOIN paid ON paid.invoice_id=si.id
     GROUP BY ms.month_start
     ORDER BY ms.month_start`,
    params
  );

  return rows;
};

const getBuildingDistribution = async (managerId: string, buildingId?: string): Promise<BuildingDistributionRow[]> => {
  const { rows } = await query<BuildingDistributionRow>(
    `WITH active_contract AS (
       SELECT DISTINCT room_id
       FROM contract
       WHERE status='ACTIVE'
     )
     SELECT
       b.id AS building_id,
       b.name AS building_name,
       COUNT(r.id)::int AS total_rooms,
       COUNT(r.id) FILTER (WHERE ac.room_id IS NOT NULL)::int AS occupied_rooms
     FROM building b
     LEFT JOIN room r ON r.building_id=b.id
     LEFT JOIN active_contract ac ON ac.room_id=r.id
     WHERE ${scopedBuildingWhere(buildingId)}
     GROUP BY b.id, b.name
     ORDER BY total_rooms DESC, b.name`,
    scopedParams(managerId, buildingId)
  );

  return rows;
};

const getRecentTenants = async (managerId: string, buildingId?: string): Promise<RecentTenantRow[]> => {
  const params = scopedParams(managerId, buildingId);
  const buildingFilter = buildingId ? 'AND b.id=$2' : '';
  const visibilityCondition = buildingId
    ? 'v.room_id IS NOT NULL'
    : `(
        NOT EXISTS (
          SELECT 1
          FROM contract_tenant ct_scope
          JOIN contract c_scope ON c_scope.id=ct_scope.contract_id
          WHERE ct_scope.tenant_id=t.id
            AND ct_scope.left_at IS NULL
            AND c_scope.status='ACTIVE'
        )
        OR v.room_id IS NOT NULL
      )`;

  const { rows } = await query<RecentTenantRow>(
    `SELECT
       t.id,
       t.full_name,
       v.room_code,
       v.building_name,
       v.contract_code,
       t.created_at,
       t.status
     FROM tenant t
     LEFT JOIN LATERAL (
       SELECT
         c.room_id,
         r.code AS room_code,
         b.name AS building_name,
         COALESCE(c.contract_code, c.id::text) AS contract_code
       FROM contract_tenant ct
       JOIN contract c ON c.id=ct.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ct.tenant_id=t.id
         AND ct.left_at IS NULL
         AND c.status='ACTIVE'
         AND b.manager_user_id=$1
         ${buildingFilter}
       ORDER BY c.start_date DESC, c.created_at DESC
       LIMIT 1
     ) v ON true
     WHERE t.status <> 'DELETED'
       AND ${visibilityCondition}
     ORDER BY t.created_at DESC
     LIMIT 5`,
    params
  );

  return rows;
};

const getRecentUnpaidInvoices = async (
  managerId: string,
  month: string,
  buildingId?: string
): Promise<RecentUnpaidInvoiceRow[]> => {
  const params = scopedParams(managerId, buildingId);
  params.push(month);
  const monthParam = params.length;

  const { rows } = await query<RecentUnpaidInvoiceRow>(
    `SELECT
       i.id,
       r.code AS room_code,
       b.name AS building_name,
       i.month,
       i.status,
       GREATEST(i.total - LEAST(COALESCE(paid.amount, 0), i.total), 0)::float AS total
     FROM invoice i
     JOIN room r ON r.id=i.room_id
     JOIN building b ON b.id=r.building_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(p.amount), 0) AS amount
       FROM payment p
       WHERE p.invoice_id=i.id AND p.status='SUCCEEDED'
     ) paid ON true
     WHERE ${scopedBuildingWhere(buildingId)}
       AND i.month=$${monthParam}::date
       AND i.status IN ('ISSUED', 'OVERDUE')
       AND GREATEST(i.total - LEAST(COALESCE(paid.amount, 0), i.total), 0) > 0
     ORDER BY i.month DESC, i.created_at DESC
     LIMIT 5`,
    params
  );

  return rows;
};

export const getDashboardSummary = async (managerId: string, filters: DashboardFilters) => {
  const month = normalizeMonth(filters.month);
  await ensureBuildingBelongsToManager(managerId, filters.buildingId);

  const [
    portfolioStats,
    totalTenants,
    monthlyRevenue,
    invoiceBalances,
    monthlyRevenueChart,
    buildingDistribution,
    recentTenants,
    recentUnpaidInvoices
  ] = await Promise.all([
    getPortfolioStats(managerId, filters.buildingId),
    getTenantCount(managerId, filters.buildingId),
    getMonthlyRevenue(managerId, month, filters.buildingId),
    getInvoiceBalances(managerId, month, filters.buildingId),
    getMonthlyRevenueChart(managerId, month, filters.buildingId),
    getBuildingDistribution(managerId, filters.buildingId),
    getRecentTenants(managerId, filters.buildingId),
    getRecentUnpaidInvoices(managerId, month, filters.buildingId)
  ]);

  const totalRooms = portfolioStats.total_rooms;
  const occupiedRooms = portfolioStats.occupied_rooms;

  return {
    summary: {
      totalBuildings: portfolioStats.total_buildings,
      totalRooms,
      occupiedRooms,
      vacantRooms: portfolioStats.vacant_rooms,
      totalTenants,
      overdueInvoices: invoiceBalances.overdue_invoices,
      overdueAmount: toNumber(invoiceBalances.overdue_amount),
      unpaidInvoices: invoiceBalances.unpaid_invoices,
      unpaidAmount: toNumber(invoiceBalances.unpaid_amount),
      monthlyRevenue,
      occupancyRate: totalRooms === 0 ? 0 : Math.round((occupiedRooms / totalRooms) * 100)
    },
    roomStatusChart: [
      { label: 'Occupied', value: occupiedRooms, color: roomStatusColors.occupied },
      { label: 'Vacant', value: portfolioStats.vacant_rooms, color: roomStatusColors.vacant },
      { label: 'Maintenance', value: portfolioStats.maintenance_rooms, color: roomStatusColors.maintenance },
      { label: 'Inactive', value: portfolioStats.inactive_rooms, color: roomStatusColors.inactive }
    ],
    monthlyRevenueChart: monthlyRevenueChart.map((item) => ({
      month: item.month,
      billed: toNumber(item.billed),
      collected: toNumber(item.collected),
      unpaid: toNumber(item.unpaid)
    })),
    buildingDistributionChart: buildingDistribution.map((item) => ({
      buildingId: item.building_id,
      buildingName: item.building_name,
      totalRooms: item.total_rooms,
      occupiedRooms: item.occupied_rooms
    })),
    recentTenants: recentTenants.map((tenant) => ({
      id: tenant.id,
      tenantName: tenant.full_name,
      roomCode: tenant.room_code ?? '-',
      buildingName: tenant.building_name ?? '-',
      contractCode: tenant.contract_code ?? '-',
      createdAt: tenant.created_at,
      status: tenant.status
    })),
    recentUnpaidInvoices: recentUnpaidInvoices.map((invoice) => ({
      id: invoice.id,
      roomCode: invoice.room_code,
      buildingName: invoice.building_name,
      month: invoice.month,
      status: invoice.status,
      total: toNumber(invoice.total)
    }))
  };
};
