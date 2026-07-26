export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export const passwordLengthRules = [
  {
    min: PASSWORD_MIN_LENGTH,
    message: `The new password must contain at least ${PASSWORD_MIN_LENGTH} characters.`,
  },
  {
    max: PASSWORD_MAX_LENGTH,
    message: `The new password cannot exceed ${PASSWORD_MAX_LENGTH} characters.`,
  },
]
