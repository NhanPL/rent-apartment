import { describe, expect, it } from 'vitest'
import { appendPaginationParams } from './pagination'

describe('appendPaginationParams', () => {
  it('serializes the standardized pagination contract', () => {
    const search = new URLSearchParams()
    appendPaginationParams(search, {
      page: 3,
      pageSize: 50,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    })

    expect(Object.fromEntries(search)).toEqual({
      page: '3',
      pageSize: '50',
      sortBy: 'createdAt',
      sortOrder: 'asc',
    })
  })
})
