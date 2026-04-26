declare module 'pg' {
  export interface QueryResult<T = unknown> {
    rows: T[]
  }

  export interface PoolClient {
    query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>
    release(): void
  }

  export class Pool {
    constructor(config?: { connectionString?: string })
    query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>
    connect(): Promise<PoolClient>
  }
}
