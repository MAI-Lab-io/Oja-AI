import React from 'react'
import { useAuth } from '../auth/AuthContext'

export function AdminRoute({ children }: { children: React.ReactNode; redirectTo?: string }) {
  const { user, isLoaded } = useAuth()
  if (!isLoaded) return <p role="status">Checking access…</p>
  if (!user?.is_staff) return <div role="alert" className="p-8">Administrator access is required.</div>
  return <>{children}</>
}

export function useAdminGuard() {
  const { user, isLoaded } = useAuth()
  return { isAdmin: !!user?.is_staff, loading: !isLoaded }
}
