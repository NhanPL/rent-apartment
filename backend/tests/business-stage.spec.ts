import { describe, expect, it } from 'vitest';
import { getContractBusinessStage } from '../src/modules/contracts/business-stage';

describe('contract business stage', () => {
  it('moves a reserved draft to waiting handover after a signed document is uploaded', () => {
    expect(getContractBusinessStage({
      status: 'DRAFT',
      note: '[RR_STAGE=RESERVED] Holding room',
      signed_document_count: 1
    })).toBe('WAITING_HANDOVER');
  });

  it('keeps explicit workflow stages and terminal statuses authoritative', () => {
    expect(getContractBusinessStage({
      status: 'DRAFT',
      note: '[RR_STAGE=WAITING_SIGNATURE]',
      signed_document_count: 1
    })).toBe('WAITING_SIGNATURE');
    expect(getContractBusinessStage({
      status: 'CANCELLED',
      note: '[RR_STAGE=WAITING_HANDOVER]',
      signed_document_count: 1
    })).toBe('CANCELLED');
  });
});
