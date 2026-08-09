import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQueryFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
} as const;

export const createPaginationQuerySchema = <T extends readonly [string, ...string[]]>(
  sortFields: T,
  defaultSortBy: T[number]
) => z.object({
  ...paginationQueryFields,
  sortBy: z.enum(sortFields).default(defaultSortBy)
});

export type SortOrder = 'asc' | 'desc';

export interface PaginationParams<TSortBy extends string> {
  page: number;
  pageSize: number;
  sortBy: TSortBy;
  sortOrder: SortOrder;
}

export interface PaginatedResult<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export const paginationOffset = ({ page, pageSize }: Pick<PaginationParams<string>, 'page' | 'pageSize'>) => (
  (page - 1) * pageSize
);

export const sqlSortDirection = (sortOrder: SortOrder): 'ASC' | 'DESC' => (
  sortOrder === 'asc' ? 'ASC' : 'DESC'
);
