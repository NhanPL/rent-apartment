import type { ReactNode } from 'react'
import loginBackground from '../../assets/login-background.svg'
import './AuthLayout.css'

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main
      className="auth-layout"
      style={{ backgroundImage: `linear-gradient(rgba(226, 239, 255, 0.7), rgba(240, 247, 255, 0.85)), url(${loginBackground})` }}
    >
      {children}
    </main>
  )
}
