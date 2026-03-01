import { useState } from 'react'
import type { FormEvent } from 'react'
import type { LoginFormValues, LoginPayload } from '../types/auth'

import './LoginForm.css'

const defaultValues: LoginFormValues = {
  email: '',
  password: '',
  rememberMe: true,
}

export function LoginForm() {
  const [values, setValues] = useState<LoginFormValues>(defaultValues)
  const [error, setError] = useState<string>('')
  const [submitted, setSubmitted] = useState<LoginPayload | null>(null)
  const [showPassword, setShowPassword] = useState<boolean>(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(null)

    if (!values.email.trim() || !values.password.trim()) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu.')
      return
    }

    const payload: LoginPayload = {
      email: values.email.trim(),
      password: values.password,
      rememberMe: values.rememberMe,
    }

    setError('')
    setSubmitted(payload)
  }

  return (
    <div className="login-card">
      <header className="login-header">
        <p className="login-eyebrow">Rent Apartment</p>
        <h1>Đăng nhập</h1>
        <p className="login-description">Chào mừng bạn quay lại hệ thống quản lý phòng trọ.</p>
      </header>

      <form className="login-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            placeholder="Nhập email"
            value={values.email}
            onChange={(event) =>
              setValues((current) => ({ ...current, email: event.target.value }))
            }
          />
        </label>

        <label className="field">
          <span>Mật khẩu</span>
          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Nhập mật khẩu"
              value={values.password}
              onChange={(event) =>
                setValues((current) => ({ ...current, password: event.target.value }))
              }
            />
            <button
              type="button"
              className="password-visibility-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </label>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={values.rememberMe}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                rememberMe: event.target.checked,
              }))
            }
          />
          <span>Ghi nhớ đăng nhập</span>
        </label>

        {error && <p className="error-message">{error}</p>}

        <button type="submit" className="submit-button">
          Đăng nhập
        </button>
      </form>

      {submitted && (
        <div className="submit-preview" aria-live="polite">
          <p>Payload gửi lên backend (demo):</p>
          <pre>{JSON.stringify(submitted, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
