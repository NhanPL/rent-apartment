import { useEffect, useState } from 'react'

export interface BreakpointState {
  xs: boolean
  md: boolean
  lg: boolean
}

function getWidth() {
  return typeof window !== 'undefined' ? window.innerWidth : 1280
}

function fromWidth(width: number): BreakpointState {
  return {
    xs: width < 768,
    md: width >= 768,
    lg: width >= 992,
  }
}

export function useBreakpoint(): BreakpointState {
  const [state, setState] = useState<BreakpointState>(() => fromWidth(getWidth()))

  useEffect(() => {
    const handler = () => setState(fromWidth(getWidth()))
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return state
}
