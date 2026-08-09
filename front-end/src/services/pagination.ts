export type SortOrder = 'asc' | 'desc'

export interface PaginationParams<TSortBy extends string = string> {
  page?: number
  pageSize?: number
  sortBy?: TSortBy
  sortOrder?: SortOrder
}

export interface PaginatedResponse<T> {
  total: number
  page: number
  pageSize: number
  items: T[]
}

export const appendPaginationParams = <TSortBy extends string>(
  search: URLSearchParams,
  params: PaginationParams<TSortBy>,
) => {
  if (params.page) search.set('page', String(params.page))
  if (params.pageSize) search.set('pageSize', String(params.pageSize))
  if (params.sortBy) search.set('sortBy', params.sortBy)
  if (params.sortOrder) search.set('sortOrder', params.sortOrder)
}
