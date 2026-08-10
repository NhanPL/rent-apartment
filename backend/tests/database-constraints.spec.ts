import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const readMigration = (name: string) => fs.readFileSync(
  path.join(repoRoot, 'migrations', name),
  'utf8'
);
const baseline = readMigration('000001_initial_schema.sql');
const invoiceHistory = readMigration('20260803b_preserve_issued_invoice_history.sql');
const paginationIndexes = readMigration('20260809_api_pagination_indexes.sql');
const audit = readMigration('20260809b_constraint_index_audit.sql');

describe('DB-002 constraints and indexes', () => {
  it('retains one active contract, primary tenant, and room/month reading', () => {
    expect(baseline).toMatch(/uq_room_active_contract[\s\S]*WHERE status = 'ACTIVE'/);
    expect(baseline).toMatch(/uq_contract_primary_tenant[\s\S]*WHERE is_primary = true/);
    expect(baseline).toContain('CONSTRAINT uq_reading_room_month UNIQUE (room_id, month)');
  });

  it('allows one non-void invoice per contract/month', () => {
    expect(invoiceHistory).toMatch(/uq_invoice_contract_month_active[\s\S]*WHERE status <> 'VOID'/);
  });

  it('requires positive amounts at every payment boundary', () => {
    expect(baseline).toMatch(/ck_payment_request_amount CHECK \(amount > 0\)/);
    expect(baseline).toMatch(/ck_payment_proof_amount CHECK \([\s\S]*transfer_amount > 0/);
    expect(baseline).toMatch(/ck_payment_amount CHECK \(amount > 0\)/);
    expect(baseline).toMatch(/ck_txn_amount CHECK \(amount > 0\)/);
  });

  it('enforces reset-aware nonnegative meter readings', () => {
    expect(audit).toContain('electricity_meter_reset boolean NOT NULL DEFAULT false');
    expect(audit).toContain('water_meter_reset boolean NOT NULL DEFAULT false');
    expect(audit).toMatch(/ck_reading_elec[\s\S]*electricity_curr >= electricity_prev[\s\S]*electricity_meter_reset/);
    expect(audit).toMatch(/ck_reading_water[\s\S]*water_curr >= water_prev[\s\S]*water_meter_reset/);
    expect(audit).toContain('ck_reading_meter_reset_note');
    expect(audit).toContain('ck_reading_nonnegative');
  });

  it('orders contract dates and invoice issue/due dates', () => {
    expect(audit).toMatch(/ck_contract_dates[\s\S]*end_date >= start_date[\s\S]*move_in_date >= start_date[\s\S]*move_out_date >= COALESCE\(move_in_date, start_date\)/);
    expect(audit).toMatch(/UPDATE invoice[\s\S]*due_date=\(issued_at AT TIME ZONE 'UTC'\)::date/);
    expect(audit).toMatch(/ck_invoice_due_date[\s\S]*due_date >= \(issued_at AT TIME ZONE 'UTC'\)::date/);
  });

  it('covers manager ownership, month/status, and payment lookups', () => {
    expect(audit).toContain('idx_room_building_status');
    expect(audit).toContain('idx_contract_room_status');
    expect(paginationIndexes).toContain('idx_invoice_status_month_created_page');
    expect(paginationIndexes).toContain('idx_utility_reading_status_month_created_page');
    expect(paginationIndexes).toContain('idx_payment_request_invoice_created_page');
    expect(paginationIndexes).toContain('idx_payment_proof_request_created_page');
  });

  it('removes only indexes covered by wider or unique indexes', () => {
    [
      'idx_tenant_user_id',
      'idx_tenant_manager',
      'idx_room_building',
      'idx_contract_room',
      'idx_contract_tenant_primary',
      'idx_utility_reading_room_month',
      'idx_utility_reading_status',
      'idx_invoice_status',
      'idx_payment_request_status',
      'idx_payment_proof_request',
      'idx_payment_invoice',
      'idx_payment_proof_id'
    ].forEach((indexName) => {
      expect(audit).toContain(`DROP INDEX IF EXISTS ${indexName};`);
    });
  });
});
