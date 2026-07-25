import type { ReactNode } from 'react'
import loginBackground from '../../assets/login-background-house.jpg'
import './AuthLayout.css'

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main
      className="auth-layout"
      style={{ backgroundImage: `linear-gradient(rgba(244, 249, 247, 0.26), rgba(231, 242, 240, 0.42)), url(${loginBackground})` }}
    >
      {children}
    </main>
  )
}
