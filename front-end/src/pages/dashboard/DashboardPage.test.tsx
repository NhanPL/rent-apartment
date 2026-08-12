import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nContext';
import { ApiError } from '../../services/apiClient';
import type { DashboardData } from './types';
import { DASHBOARD_REFRESH_INTERVAL_MS, DashboardPage } from './DashboardPage';

const serviceMocks = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
  listDashboardBuildings: vi.fn()
}));

vi.mock('../../services/dashboardService', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/dashboardService')>();
  return {
    ...original,
    getDashboardData: serviceMocks.getDashboardData,
    listDashboardBuildings: serviceMocks.listDashboardBuildings
  };
});

vi.mock('./components/DashboardSummaryCards', () => ({
  DashboardSummaryCards: ({ loading }: { loading: boolean }) => (
    <div>{loading ? 'Summary loading' : 'Summary ready'}</div>
  )
}));

vi.mock('./components/DashboardCharts', () => ({
  DashboardCharts: ({ loading }: { loading: boolean }) => (
    <div>{loading ? 'Charts loading' : 'Charts ready'}</div>
  )
}));

const emptyDashboard: DashboardData = {
  summary: {
    totalBuildings: 0,
    totalRooms: 0,
    occupiedRooms: 0,
    vacantRooms: 0,
    totalTenants: 0,
    overdueInvoices: 0,
    overdueAmount: 0,
    unpaidInvoices: 0,
    unpaidAmount: 0,
    monthlyRevenue: 0,
    occupancyRate: 0
  },
  roomStatusChart: [],
  monthlyRevenueChart: [],
  buildingDistributionChart: [],
  recentTenants: [],
  recentUnpaidInvoices: []
};

describe('DashboardPage states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    serviceMocks.listDashboardBuildings.mockResolvedValue([]);
  });

  it('shows loading state followed by explicit empty states', async () => {
    let resolveDashboard!: (value: DashboardData) => void;
    serviceMocks.getDashboardData.mockReturnValue(new Promise((resolve) => {
      resolveDashboard = resolve;
    }));

    render(<I18nProvider><DashboardPage onNavigate={vi.fn()} /></I18nProvider>);
    expect(screen.getByText('Summary loading')).toBeInTheDocument();
    expect(screen.getByText('Charts loading')).toBeInTheDocument();

    resolveDashboard(emptyDashboard);
    expect(await screen.findByText('No recent tenants')).toBeInTheDocument();
    expect(screen.getByText('No unpaid invoices')).toBeInTheDocument();
    expect(screen.getByText('Summary ready')).toBeInTheDocument();
  });

  it('uses the API error message and retries successfully', async () => {
    const user = userEvent.setup();
    serviceMocks.getDashboardData
      .mockRejectedValueOnce(new ApiError(
        'The dashboard service is temporarily unavailable.',
        'SERVICE_UNAVAILABLE',
        503
      ))
      .mockResolvedValueOnce(emptyDashboard);

    render(<I18nProvider><DashboardPage onNavigate={vi.fn()} /></I18nProvider>);
    expect(await screen.findByText('Dashboard data could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('The system is temporarily unavailable. Please try again later.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No recent tenants')).toBeInTheDocument();
  });

  it('refreshes data in the background while the page is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serviceMocks.getDashboardData.mockResolvedValue(emptyDashboard);
    const { unmount } = render(<I18nProvider><DashboardPage onNavigate={vi.fn()} /></I18nProvider>);
    await waitFor(() => expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(DASHBOARD_REFRESH_INTERVAL_MS);
    await waitFor(() => expect(serviceMocks.getDashboardData).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/Live \| Last updated/)).toBeInTheDocument();
    unmount();
    vi.useRealTimers();
  });
});
