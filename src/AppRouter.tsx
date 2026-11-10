import React, { lazy, Suspense, useEffect, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { AuthForm } from './components/AuthForm'
import { SocialAuth } from './components/SocialAuth'
import { PublicCatalog } from './components/PublicCatalog'
import { LandingPage } from './components/LandingPage'

const App = lazy(() => import('./App'))

export function AppRouter() {
  const [, updateRoute] = useState(0)
  useEffect(() => {
    const onPop = () => updateRoute(value => value + 1)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const pathname = window.location.pathname.replace(/\/$/, '')
  const search = window.location.search
  useEffect(() => {
    const canonical = pathname === '/model-zoo' ? '/models' : pathname === '/data-zoo' ? '/datasets' : ''
    if (canonical) {
      window.history.replaceState({}, '', canonical + search + window.location.hash)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [pathname, search])
  const { isSignedIn, user } = useAuth()
  const navigate = (path: string) => {
    window.history.pushState({}, '', path)
    updateRoute(value => value + 1)
  }
  // Public browsing must not depend on account-service loading or login status.
  if (['/models', '/model-zoo'].includes(pathname) || /^\/models\/[^/]+\/[^/]+\/?$/.test(window.location.pathname)) return <PublicCatalog initialTab="models" />
  if (['/datasets', '/data-zoo'].includes(pathname) || /^\/datasets\/[^/]+\/[^/]+\/?$/.test(window.location.pathname)) return <PublicCatalog initialTab="datasets" />
  if (window.location.pathname === '/auth/provider-callback') return <SocialAuth />
  if (window.location.pathname === '/auth/connections') return <SocialAuth connections />
  if (window.location.pathname === '/auth' || window.location.pathname.startsWith('/auth/')) return <AuthForm onBack={() => updateRoute(value => value + 1)} />
  if (window.location.pathname === '/') return <LandingPage onLoginClick={() => navigate(isSignedIn ? '/dashboard' : '/auth')} onGetStarted={() => navigate('/models')} user={user} isSignedIn={isSignedIn} />
  if (!isSignedIn) return <LandingPage onLoginClick={() => navigate('/auth')} onGetStarted={() => navigate('/models')} user={null} isSignedIn={false} />
  return <Suspense fallback={<p role="status" className="p-8">Loading Oja AI…</p>}><App /></Suspense>
}
