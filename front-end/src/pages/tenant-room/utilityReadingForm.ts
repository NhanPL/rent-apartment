import type {
  UtilityReadingStatus,
  UtilityReadingSubmitPayload,
} from '../../services/tenantRoomService'

export interface TenantUtilityReadingFormValues {
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  note: string
}

export type TenantUtilityReadingValidationResult =
  | { ok: true; formMonth: string; payload: UtilityReadingSubmitPayload }
  | { ok: false; reason: 'locked' | 'missing-month' | 'missing-current-readings' }

export function isTenantUtilityReadingLocked(status: UtilityReadingStatus | null | undefined) {
  return status === 'APPROVED' || status === 'INVOICED'
}

export function calculateReadingUsage(previous: number | null | undefined, current: number | null | undefined) {
  if (previous === null || previous === undefined || current === null || current === undefined) {
    return null
  }

  return Math.max(0, current - previous)
}

export function validateTenantUtilityReading(
  values: TenantUtilityReadingFormValues,
  readingLocked: boolean,
): TenantUtilityReadingValidationResult {
  if (readingLocked) {
    return { ok: false, reason: 'locked' }
  }

  const formMonth = values.month?.trim()
  if (!formMonth) {
    return { ok: false, reason: 'missing-month' }
  }

  if (
    values.electricity_curr === null ||
    values.electricity_curr === undefined ||
    values.water_curr === null ||
    values.water_curr === undefined
  ) {
    return { ok: false, reason: 'missing-current-readings' }
  }

  return {
    ok: true,
    formMonth,
    payload: {
      month: `${formMonth}-01`,
      electricity_curr: values.electricity_curr,
      water_curr: values.water_curr,
      note: values.note.trim() || null,
    },
  }
}
