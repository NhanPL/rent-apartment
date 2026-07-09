export type ContractBusinessStage = 'RESERVED' | 'WAITING_SIGNATURE' | 'WAITING_HANDOVER' | 'ACTIVE' | 'CANCELLED' | 'ENDED';

interface ContractStageInput {
  status?: string;
  note?: string | null;
  signed_document_count?: number | string | null;
}

const stageMarkerPattern = /\[RR_STAGE=(RESERVED|WAITING_SIGNATURE|WAITING_HANDOVER)\]/i;

export const getContractBusinessStage = (contract: ContractStageInput): ContractBusinessStage => {
  if (contract.status === 'ACTIVE') return 'ACTIVE';
  if (contract.status === 'CANCELLED') return 'CANCELLED';
  if (contract.status === 'ENDED') return 'ENDED';

  const marker = contract.note?.match(stageMarkerPattern)?.[1]?.toUpperCase() as ContractBusinessStage | undefined;
  if (marker) return marker;

  const signedDocumentCount = Number(contract.signed_document_count ?? 0);
  return signedDocumentCount > 0 ? 'WAITING_HANDOVER' : 'RESERVED';
};

export const businessStageSql = `
  CASE
    WHEN c.status='ACTIVE' THEN 'ACTIVE'
    WHEN c.status='CANCELLED' THEN 'CANCELLED'
    WHEN c.status='ENDED' THEN 'ENDED'
    WHEN COALESCE(c.note, '') ~* '\\[RR_STAGE=WAITING_HANDOVER\\]' THEN 'WAITING_HANDOVER'
    WHEN COALESCE(c.note, '') ~* '\\[RR_STAGE=WAITING_SIGNATURE\\]' THEN 'WAITING_SIGNATURE'
    WHEN COALESCE(c.note, '') ~* '\\[RR_STAGE=RESERVED\\]' THEN 'RESERVED'
    WHEN COALESCE(contract_docs.signed_document_count, 0) > 0 THEN 'WAITING_HANDOVER'
    ELSE 'RESERVED'
  END AS business_stage
`;
