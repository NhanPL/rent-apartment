import { PoolClient, QueryResult } from 'pg';
import { pool } from './pool';

export const query = <T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>> =>
  pool.query<T>(text, params);

export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
