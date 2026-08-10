import type { ReactNode } from 'react'
import loginBackground from '../../assets/login-background-luxury.webp'
import './AuthLayout.css'

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main
      className="auth-layout"
      style={{ backgroundImage: `linear-gradient(rgba(248, 248, 244, 0.24), rgba(232, 239, 234, 0.4)), url(${loginBackground})` }}
    >
      {children}
    </main>
  )
}
