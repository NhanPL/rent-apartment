import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../services/apiClient'

export const queryKeys = {
  contracts: {
    all: ['contracts'] as const,
    list: (filters: object) => ['contracts', 'list', filters] as const,
    references: ['contracts', 'references'] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (filters: object) => ['invoices', 'list', filters] as const,
    summary: (month: string) => ['invoices', 'summary', month] as const,
    references: ['invoices', 'references'] as const,
  },
}

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status && [400, 401, 403, 404, 409, 422].includes(error.status)) return false
  return failureCount < 2
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
})
