import React, { useEffect, useState } from 'react'
import { apiRequest, ApiError, AUTH_BASE, csrfHeaders, hasPendingVerification } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Github } from 'lucide-react'

type Provider = 'google' | 'github'
const providers: { id: Provider; name: string }[] = [{ id: 'github', name: 'GitHub' }, { id: 'google', name: 'Google' }]

function GoogleIcon() {
  return <svg viewBox="0 0 48 48" style={{ width: 18, height: 18 }} aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
    <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </svg>
}

/** Full browser navigation is required: fetch cannot follow the external OAuth handshake. */
export async function startProviderLogin(provider: Provider, process: 'login' | 'connect' = 'login', returnToConnections = false) {
  // Obtain a token from Django immediately before navigating, including after
  // another tab signs in/out and rotates the session's CSRF secret.
  const headers = await csrfHeaders(true)
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `${AUTH_BASE}/auth/provider/redirect`
  for (const [name, value] of Object.entries({
    provider, process, callback_url: `${window.location.origin}/auth/provider-callback${process === 'connect' ? '?process=connect' : returnToConnections ? '?next=connections' : ''}`,
    csrfmiddlewaretoken: headers['X-CSRFToken'],
  })) {
    const input = document.createElement('input')
    input.type = 'hidden'; input.name = name; input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

export function SocialLoginButtons({ connect = false, linkedProviders = [], returnToConnections = false, compact = false }: { connect?: boolean; linkedProviders?: string[]; returnToConnections?: boolean; compact?: boolean }) {
  const [available, setAvailable] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    apiRequest(`${AUTH_BASE}/config`).then(result => {
      if (active) setAvailable((result.data?.socialaccount?.providers || []).map((p: { id: string }) => p.id))
    }).catch(() => { if (active) setError('Unable to load sign-in options. Please refresh and try again.') })
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])
  return <div className={compact ? 'auth-social-buttons' : 'space-y-3 mb-5'}>
    {providers.map(provider => <Button key={provider.id} type="button" variant="outline" className="w-full"
      disabled={!ready || busy || !available.includes(provider.id) || (connect && linkedProviders.includes(provider.id))} onClick={async () => {
        setBusy(true); setError('')
        try { await startProviderLogin(provider.id, connect ? 'connect' : 'login', returnToConnections) }
        catch { setError('Unable to start sign-in. Please try again.'); setBusy(false) }
      }} aria-label={connect ? undefined : `Continue with ${provider.name}`}>
        {provider.id === 'google' ? <GoogleIcon /> : <Github aria-hidden="true" style={{ width: 20, height: 20 }} />}
        {connect ? (linkedProviders.includes(provider.id) ? `${provider.name} linked` : `Link ${provider.name} to this account`) : compact ? provider.name : `Continue with ${provider.name}`}
      </Button>)}
    {ready && !error && available.length === 0 && <p className="text-sm text-muted-foreground">Provider sign-in is not available yet.</p>}
    {ready && !error && !available.includes('github') && available.length > 0 && <p className="auth-provider-note">GitHub sign-in is not available yet.</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}

export function SocialAuth({ connections = false }: { connections?: boolean }) {
  const { user, isLoaded, refresh } = useAuth()
  const [loading, setLoading] = useState(!connections)
  const [signup, setSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [linked, setLinked] = useState<string[]>([])
  const [loadingLinks, setLoadingLinks] = useState(connections)
  const [callbackError] = useState(() => new URLSearchParams(window.location.search).has('error'))
  const [connecting] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('process') === 'connect' || params.get('next') === 'connections'
  })
  useEffect(() => {
    if (connections) {
      let active = true
      setLinked([]); setLoadingLinks(true)
      if (user) apiRequest(`${AUTH_BASE}/account/providers`).then(result => {
        if (active) setLinked(result.data.map((account: { provider: { id: string } }) => account.provider.id))
      }).catch(() => { if (active) setError('Unable to load linked accounts. Please refresh.') })
        .finally(() => { if (active) setLoadingLinks(false) })
      return () => { active = false }
    }
    let active = true
    const resume = async () => {
      if (callbackError) {
        window.history.replaceState({}, '', window.location.pathname)
        throw new Error('Provider sign-in could not be completed or was cancelled. Please try again. If you already have an account, sign in with your existing method and link the provider.')
      }
      let session
      try { session = await apiRequest(`${AUTH_BASE}/auth/session`) }
      catch (caught) {
        if (!(caught instanceof ApiError && caught.status === 401)) throw caught
        session = caught.data
      }
      if (!active) return
      if (session.meta?.is_authenticated) {
        await refresh()
        if (active) window.location.replace(connecting ? '/auth/connections' : '/models')
      } else if (hasPendingVerification(session)) {
        window.location.replace('/auth/verification-sent')
      } else if (session.data?.flows?.some((flow: { id: string; is_pending?: boolean }) => flow.id === 'provider_signup' && flow.is_pending)) {
        const pending = await apiRequest(`${AUTH_BASE}/auth/provider/signup`)
        if (active) {
          setEmail(pending.data.user.email || ''); setUsername(pending.data.user.username || '')
          setFirstName(pending.data.user.first_name || ''); setLastName(pending.data.user.last_name || ''); setSignup(true)
        }
      } else throw new Error('This sign-in session has expired. Please start again.')
    }
    void resume().catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Unable to complete sign-in.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [connections, user?.id])
  return <div className="auth-shell min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>{connections ? 'Linked sign-in accounts' : signup ? 'Complete your account' : 'Complete sign-in'}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {loading && <p role="status">Completing sign-in…</p>}
        {connections && isLoaded && (user ? <>
          <p>You are linking sign-in methods to <strong>{user.email}</strong>.</p>
          <p>Once linked, Google or GitHub opens this same account with your existing models and datasets.</p>
          {loadingLinks ? <p role="status">Loading linked accounts…</p> : !error && <>
            <p>Linked providers: {providers.filter(provider => linked.includes(provider.id)).map(provider => provider.name).join(', ') || 'None'}</p>
            <SocialLoginButtons connect linkedProviders={linked} />
          </>}
        </> : <>
          <p>Sign in with your existing account to link Google or GitHub.</p>
          <Button asChild><a href="/auth/login?next=connections">Sign in to link an account</a></Button>
        </>)}
        {signup && <form className="auth-form" onSubmit={async event => {
          event.preventDefault(); setLoading(true); setError('')
          try {
            try { await apiRequest(`${AUTH_BASE}/auth/provider/signup`, { method: 'POST', body: JSON.stringify({ email, username, first_name: firstName, last_name: lastName }) }) }
            catch (caught) {
              if (caught instanceof ApiError && hasPendingVerification(caught.data)) {
                window.location.replace('/auth/verification-sent'); return
              }
              throw caught
            }
            await refresh(); window.location.replace('/models')
          } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create account.') }
          finally { setLoading(false) }
        }}>
          <p>Creating a new account? Choose a public username and confirm your email. We will request email verification when needed.</p>
          <p>Already have an account? <a className="underline" href="/auth/login?next=connections">Sign in to your existing account to link Google or GitHub</a>. Your existing uploads will stay with that account.</p>
          <div><Label htmlFor="social-first-name">First name</Label><Input id="social-first-name" autoComplete="given-name" required maxLength={150} value={firstName} onChange={event => setFirstName(event.target.value)} /></div>
          <div><Label htmlFor="social-last-name">Last name</Label><Input id="social-last-name" autoComplete="family-name" required maxLength={150} value={lastName} onChange={event => setLastName(event.target.value)} /></div>
          <div><Label htmlFor="social-email">Email</Label><Input id="social-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="social-username">Public username</Label><Input id="social-username" autoComplete="username" maxLength={150} required value={username} onChange={e => setUsername(e.target.value)} /></div>
          <Button type="submit" disabled={loading}>Create account</Button>
        </form>}
        <div className="flex gap-4"><a href="/auth/login">Sign in</a><a href="/models">Oja Models</a></div>
      </CardContent>
    </Card>
  </div>
}
