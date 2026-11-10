import React, { createContext, useContext, useEffect, useState } from 'react'
import { apiRequest, ApiError, AUTH_BASE } from '../lib/api'

export interface Account {
  id: string
  username: string
  email: string
  name: string
  is_staff: boolean
  email_verified: boolean
}
interface AuthState {
  user: Account | null
  isLoaded: boolean
  isSignedIn: boolean
  error: string
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Account | null>(null)
  const [isLoaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => {
    try {
      const data = await apiRequest('/api/v1/accounts/me/')
      setUser(data.user)
      setError('')
    } catch (error) {
      setUser(null)
      if (error instanceof ApiError && [401, 403].includes(error.status)) setError('')
      else setError('The account service is unavailable. Check your connection and try again.')
    } finally {
      setLoaded(true)
    }
  }
  useEffect(() => { void refresh() }, [])
  const signOut = async () => {
    try {
      await apiRequest(`${AUTH_BASE}/auth/session`, { method: 'DELETE' })
    } catch (error) {
      // allauth reports the resulting anonymous session with HTTP 401.
      if (!(error instanceof ApiError && error.status === 401 && error.data?.meta?.is_authenticated === false)) throw error
    }
    setUser(null)
  }
  return <AuthContext.Provider value={{ user, isLoaded, isSignedIn: !!user, error, refresh, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
