import { describe, expect, it } from 'vitest';
import { getMonthlyBillingAction } from '../src/modules/monthly-billing/monthly-billing.service';

describe('monthly billing next action', () => {
  it.each([
    [{}, 'ENTER_READING'],
    [{ reading_status: 'SUBMITTED' }, 'REVIEW_READING'],
    [{ reading_status: 'REJECTED' }, 'CORRECT_READING'],
    [{ reading_status: 'APPROVED' }, 'GENERATE_INVOICE'],
    [{ invoice_id: 'invoice', invoice_status: 'DRAFT', outstanding_amount: 100 }, 'REVIEW_DRAFT'],
    [{ invoice_id: 'invoice', invoice_status: 'ISSUED', outstanding_amount: 100 }, 'WAITING_PAYMENT'],
    [{ invoice_id: 'invoice', invoice_status: 'ISSUED', payment_request_status: 'TRANSFER_SUBMITTED', outstanding_amount: 100 }, 'RECONCILE_PAYMENT'],
    [{ invoice_id: 'invoice', invoice_status: 'PAID', outstanding_amount: 0 }, 'PAID'],
  ])('maps %o to %s', (row, expected) => {
    expect(getMonthlyBillingAction(row)).toBe(expected);
  });
});
