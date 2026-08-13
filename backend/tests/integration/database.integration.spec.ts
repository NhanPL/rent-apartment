import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for integration tests');

const pool = new Pool({ connectionString: databaseUrl });

type Fixture = {
  managerA: string;
  managerB: string;
};

const createManager = async (suffix: string): Promise<string> => {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO app_user(role,email,username,password_hash,is_active,account_status)
     VALUES ('MANAGER',$1,$2,$3,true,'ACTIVE')
     RETURNING id`,
    [`manager-${suffix}@example.test`, `manager-${suffix}`, '$2b$12$integration-test-hash']
  );
  return result.rows[0].id;
};

describe('PostgreSQL integration foundation', () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = {
      managerA: await createManager('a'),
      managerB: await createManager('b')
    };
  });

  afterAll(async () => {
    await pool.end();
  });

  it('applies every migration to an empty database', async () => {
    const ledger = await pool.query<{ count: string }>('SELECT count(*) FROM schema_migrations');
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema=current_schema()
         AND table_name IN ('app_user','contract','invoice','payment','audit_log')`
    );

    expect(Number(ledger.rows[0].count)).toBeGreaterThan(10);
    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      'app_user', 'audit_log', 'contract', 'invoice', 'payment'
    ]);
  });

  it('enforces foreign keys, checks, and unique indexes', async () => {
    await expect(pool.query(
      `INSERT INTO room(building_id,code,max_occupants)
       VALUES ('00000000-0000-0000-0000-000000000001','FK-FAIL',1)`
    )).rejects.toMatchObject({ code: '23503' });

    const building = await pool.query<{ id: string }>(
      `INSERT INTO building(manager_user_id,code,name,address)
       VALUES ($1,'CONSTRAINTS','Constraints','Test address') RETURNING id`,
      [fixture.managerA]
    );
    await expect(pool.query(
      `INSERT INTO room(building_id,code,max_occupants) VALUES ($1,'CHECK-FAIL',0)`,
      [building.rows[0].id]
    )).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(
      `INSERT INTO building(manager_user_id,code,name,address)
       VALUES ($1,'CONSTRAINTS','Duplicate','Test address')`,
      [fixture.managerA]
    )).rejects.toMatchObject({ code: '23505' });
  });

  it('rolls back every write when a transaction step fails', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const building = await client.query<{ id: string }>(
        `INSERT INTO building(manager_user_id,code,name,address)
         VALUES ($1,'ROLLBACK','Rollback','Test address') RETURNING id`,
        [fixture.managerA]
      );
      await expect(client.query(
        `INSERT INTO room(building_id,code,max_occupants) VALUES ($1,'INVALID',0)`,
        [building.rows[0].id]
      )).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const result = await pool.query(
      `SELECT id FROM building WHERE manager_user_id=$1 AND code='ROLLBACK'`,
      [fixture.managerA]
    );
    expect(result.rowCount).toBe(0);
  });

  it('preserves UTC instants and application-local calendar conversion', async () => {
    const result = await pool.query<{
      utc_value: string;
      local_value: string;
      utc_month: string;
    }>(
      `SELECT
         to_char($1::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') AS utc_value,
         to_char($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD HH24:MI:SS') AS local_value,
         to_char($2::date,'YYYY-MM-DD') AS utc_month`,
      ['2026-08-01T00:30:00+07:00', '2026-08-01']
    );

    expect(result.rows[0]).toEqual({
      utc_value: '2026-07-31 17:30:00',
      local_value: '2026-08-01 00:30:00',
      utc_month: '2026-08-01'
    });
  });

  it('preserves numeric money precision without floating-point rounding', async () => {
    const building = await pool.query<{ id: string }>(
      `INSERT INTO building(manager_user_id,code,name,address)
       VALUES ($1,'MONEY','Money','Test address') RETURNING id`,
      [fixture.managerA]
    );
    const room = await pool.query<{ base_rent: string; area_m2: string }>(
      `INSERT INTO room(building_id,code,base_rent,area_m2,max_occupants)
       VALUES ($1,'MONEY-01',123456789.12,45.67,2)
       RETURNING base_rent,area_m2`,
      [building.rows[0].id]
    );

    expect(room.rows[0]).toEqual({ base_rent: '123456789.12', area_m2: '45.67' });
  });

  it('filters manager-owned rows at the database boundary', async () => {
    await pool.query(
      `INSERT INTO building(manager_user_id,code,name,address)
       VALUES ($1,'OWN-A','Owned A','A'),($2,'OWN-B','Owned B','B')`,
      [fixture.managerA, fixture.managerB]
    );
    const result = await pool.query<{ code: string }>(
      `SELECT code FROM building WHERE manager_user_id=$1 ORDER BY code`,
      [fixture.managerA]
    );

    expect(result.rows.map((row) => row.code)).toContain('OWN-A');
    expect(result.rows.map((row) => row.code)).not.toContain('OWN-B');
  });

  it('detects an applied migration checksum mismatch', async () => {
    const migration = await pool.query<{ version: string; checksum: string }>(
      'SELECT version,checksum FROM schema_migrations ORDER BY version LIMIT 1'
    );
    const original = migration.rows[0];
    await pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2', [
      '0'.repeat(64), original.version
    ]);

    try {
      expect(() => execFileSync(process.execPath, ['scripts/migrate.js', '--verify'], {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'pipe'
      })).toThrow(/different checksum/);
    } finally {
      await pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2', [
        original.checksum, original.version
      ]);
    }
  });
});
