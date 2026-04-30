declare module 'pg' {
  export interface QueryResult<T = unknown> {
    rows: T[]
  }

  export interface PoolClient {
    query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>
    release(): void
  }

  export class Pool {
    constructor(config?: { connectionString?: string; max?: number; idleTimeoutMillis?: number; connectionTimeoutMillis?: number; ssl?: { rejectUnauthorized: boolean } })
    query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>
    connect(): Promise<PoolClient>
  }
}

declare module 'bcrypt' {
  export function compare(data: string, encrypted: string): Promise<boolean>
  export function hash(data: string, saltOrRounds: string | number): Promise<string>
  const bcrypt: {
    compare: typeof compare
    hash: typeof hash
  }
  export default bcrypt
}
