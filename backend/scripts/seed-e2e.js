const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

if (process.env.APP_ENV !== 'test') {
  throw new Error('E2E seed is allowed only when APP_ENV=test.');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';
const AVAILABLE_TENANT_USER_ID = '20000000-0000-4000-8000-000000000002';
const AVAILABLE_TENANT_ID = '20000000-0000-4000-8000-000000000102';
const BUILDING_ID = '20000000-0000-4000-8000-000000000201';
const VACANT_ROOM_ID = '20000000-0000-4000-8000-000000000301';
const ACTIVATION_USER_ID = '20000000-0000-4000-8000-000000000003';
const ACTIVATION_TENANT_ID = '20000000-0000-4000-8000-000000000103';
const RESET_USER_ID = '20000000-0000-4000-8000-000000000004';
const CHANGE_USER_ID = '20000000-0000-4000-8000-000000000005';
const SESSION_USER_ID = '20000000-0000-4000-8000-000000000006';
const ACTIVATION_TOKEN = 'e2e_activation_token_abcdefghijklmnopqrstuvwxyz012345';
const RESET_TOKEN = 'e2e_reset_token_abcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_PASSWORD = 'E2E secure passphrase 2026';

const tokenHash = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const passwordHash = async (password) => {
  const digest = crypto.createHash('sha256').update(password, 'utf8').digest('base64');
  return `$bcrypt-sha256$${await bcrypt.hash(digest, 10)}`;
};

const insertActiveUser = async (client, id, role, username, email, hash) => {
  await client.query(
    `INSERT INTO app_user(id,role,email,username,password_hash,is_active,account_status)
     VALUES ($1,$2,$3,$4,$5,true,'ACTIVE')`,
    [id, role, email, username, hash]
  );
};

const main = async () => {
  const client = await pool.connect();
  const hash = await passwordHash(DEFAULT_PASSWORD);
  try {
    await client.query('BEGIN');
    await insertActiveUser(client, MANAGER_ID, 'MANAGER', 'e2e-manager', 'e2e-manager@example.test', hash);
    await insertActiveUser(client, AVAILABLE_TENANT_USER_ID, 'TENANT', 'e2e-available', 'e2e-available@example.test', hash);
    await insertActiveUser(client, RESET_USER_ID, 'TENANT', 'e2e-reset', 'e2e-reset@example.test', hash);
    await insertActiveUser(client, CHANGE_USER_ID, 'MANAGER', 'e2e-change', 'e2e-change@example.test', hash);
    await insertActiveUser(client, SESSION_USER_ID, 'MANAGER', 'e2e-session', 'e2e-session@example.test', hash);

    await client.query(
      `INSERT INTO app_user(id,role,email,username,password_hash,is_active,account_status)
       VALUES ($1,'TENANT','e2e-activation@example.test','e2e-activation',NULL,false,'PENDING_ACTIVATION')`,
      [ACTIVATION_USER_ID]
    );
    await client.query(
      `INSERT INTO manager_profile(user_id,full_name) VALUES ($1,'E2E Manager')`,
      [MANAGER_ID]
    );
    await client.query(
      `INSERT INTO tenant(id,user_id,manager_user_id,full_name,identity_number,email,phone,status)
       VALUES
         ($1,$2,$3,'E2E Available Tenant','E2E-AVAILABLE-001','e2e-available@example.test','0900999001','ACTIVE'),
         ($4,$5,$3,'E2E Activation Tenant','E2E-ACTIVATION-001','e2e-activation@example.test','0900999002','ACTIVE')`,
      [AVAILABLE_TENANT_ID, AVAILABLE_TENANT_USER_ID, MANAGER_ID, ACTIVATION_TENANT_ID, ACTIVATION_USER_ID]
    );
    await client.query(
      `INSERT INTO building(id,manager_user_id,code,name,address)
       VALUES ($1,$2,'E2E-BLD','E2E Building','E2E address')`,
      [BUILDING_ID, MANAGER_ID]
    );
    await client.query(
      `INSERT INTO room(id,building_id,code,floor,area_m2,status,base_rent,deposit_default,max_occupants)
       VALUES ($1,$2,'E2E-201',2,32,'ACTIVE',4200000,4200000,2)`,
      [VACANT_ROOM_ID, BUILDING_ID]
    );
    await client.query(
      `INSERT INTO utility_rate(building_id,effective_from,electricity_unit_price,water_unit_price)
       VALUES ($1,'2026-01-01',4000,15000)`,
      [BUILDING_ID]
    );
    await client.query(
      `INSERT INTO account_activation_token(user_id,token_hash,expires_at,created_by_user_id)
       VALUES ($1,$2,now() + interval '2 hours',$3)`,
      [ACTIVATION_USER_ID, tokenHash(ACTIVATION_TOKEN), MANAGER_ID]
    );
    await client.query(
      `INSERT INTO password_reset_token(user_id,token_hash,expires_at)
       VALUES ($1,$2,now() + interval '30 minutes')`,
      [RESET_USER_ID, tokenHash(RESET_TOKEN)]
    );
    await client.query('COMMIT');
    console.log('E2E fixtures created.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error('Unable to create E2E fixtures:', error);
  process.exitCode = 1;
});
