import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLengthRules,
} from './passwordPolicy'

describe('frontend password policy', () => {
  it('matches the backend 12 to 128 character policy', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12)
    expect(PASSWORD_MAX_LENGTH).toBe(128)
    expect(passwordLengthRules).toEqual([
      {
        min: 12,
        message: 'The new password must contain at least 12 characters.',
      },
      {
        max: 128,
        message: 'The new password cannot exceed 128 characters.',
      },
    ])
  })
})
