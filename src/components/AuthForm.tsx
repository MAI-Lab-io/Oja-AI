import React, { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest, ApiError, AUTH_BASE, hasPendingVerification } from '../lib/api'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { SocialLoginButtons } from './SocialAuth'
import { AuthAccountPanel } from './AuthAccountPanel'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'

type Mode = 'login' | 'signup' | 'forgot-password' | 'reset-password' | 'verify-email' | 'verification-sent' | 'change-password'
const titles: Record<Mode, string> = {
  login: 'Sign in', signup: 'Create an account', 'forgot-password': 'Forgot password',
  'reset-password': 'Choose a new password', 'verify-email': 'Verify your email',
  'verification-sent': 'Check your email', 'change-password': 'Change password',
}

export function AuthForm({ onBack }: { onBack?: () => void }) {
  const { refresh } = useAuth()
  const routeMode = (): Mode => {
    const value = window.location.pathname.split('/').pop() as Mode
    return value in titles ? value : 'login'
  }
  const [mode, setMode] = useState<Mode>(routeMode)
  const [dialogOpen, setDialogOpen] = useState(() => window.location.pathname !== '/auth' && ['login', 'signup'].includes(routeMode()))
  const [loginStep, setLoginStep] = useState<'email' | 'password'>('email')
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [key] = useState(() => new URLSearchParams(window.location.search).get('key') || '')
  const [linkAfterLogin] = useState(() => new URLSearchParams(window.location.search).get('next') === 'connections')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    // Remove email tokens from the address bar after capturing them in memory.
    if (key) window.history.replaceState({}, '', window.location.pathname)
    const onPop = () => { setMode(routeMode()); setDialogOpen(['login', 'signup'].includes(routeMode())); setLoginStep('email'); setMessage(''); setError(''); setCompleted(false) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [key])

  const navigate = (next: Mode) => {
    setMode(next); setError(''); setMessage(''); setCompleted(false)
    setDialogOpen(['login', 'signup'].includes(next)); setLoginStep('email'); setShowPassword(false)
    setPassword(''); setConfirmation(''); setCurrentPassword('')
    window.history.pushState({}, '', `/auth/${next}${next === 'login' && linkAfterLogin ? '?next=connections' : ''}`)
  }
  const post = (path: string, data: Record<string, string>) => apiRequest(`${AUTH_BASE}/${path}`, {
    method: 'POST', body: JSON.stringify(data),
  })
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'login' && loginStep === 'email') { setLoginStep('password'); return }
      if (['reset-password', 'change-password'].includes(mode) && password !== confirmation) {
        throw new Error('Passwords do not match.')
      }
      if (mode === 'signup' || mode === 'login') {
        try {
          await post(`auth/${mode}`, mode === 'signup' ? { email, username, password, first_name: firstName, last_name: lastName } : { email, password })
        } catch (error) {
          if (error instanceof ApiError && error.status === 401 && hasPendingVerification(error.data)) {
            navigate('verification-sent')
            return
          }
          throw error
        }
        window.history.replaceState({}, '', linkAfterLogin ? '/auth/connections' : '/dashboard')
        await refresh()
        window.dispatchEvent(new PopStateEvent('popstate'))
      } else if (mode === 'forgot-password') {
        await post('auth/password/request', { email })
        setMessage('If an account exists for that email, recovery instructions will be sent. Check your inbox and spam folder.')
        setCompleted(true)
      } else if (mode === 'verify-email') {
        if (!key) throw new Error('This verification link is incomplete. Open the full link from your email.')
        try { await post('auth/email/verify', { key }) }
        catch (error) {
          if (!(error instanceof ApiError && error.status === 401 && error.data?.meta?.is_authenticated === false)) throw error
        }
        setCompleted(true)
        setMessage('Email verified. You can now sign in.')
        await refresh()
      } else if (mode === 'reset-password' || mode === 'change-password') {
        if (mode === 'reset-password' && !key) throw new Error('This reset link is incomplete. Request a new link.')
        try {
          await post(mode === 'reset-password' ? 'auth/password/reset' : 'account/password/change',
            mode === 'reset-password' ? { key, password } : { current_password: currentPassword, new_password: password })
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 401 && error.data?.meta?.is_authenticated === false)) throw error
        }
        setPassword(''); setConfirmation(''); setCurrentPassword('')
        setCompleted(true)
        setMessage('Password updated. Sign in with your new password.')
        await refresh()
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    } finally { setLoading(false) }
  }

  const resend = async () => {
    setLoading(true); setError(''); setMessage('')
    try {
      await apiRequest('/api/v1/accounts/resend-verification/', { method: 'POST', body: '{}' })
      setMessage('Verification instructions requested. Check your inbox and spam folder.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to resend. Try signing in again.') }
    finally { setLoading(false) }
  }
  const usesPassword = ['login', 'signup', 'reset-password', 'change-password'].includes(mode)
  const backHome = () => {
    window.history.replaceState({}, '', '/')
    if (onBack) onBack(); else window.location.assign('/')
  }
  if (mode === 'login' || mode === 'signup') return <AuthAccountPanel mode={mode} open={dialogOpen}
    onOpenChange={open => { setDialogOpen(open); if (!open) { setPassword(''); setShowPassword(false); setLoginStep('email'); setError('') } }}
    onNavigate={navigate} onBack={backHome}>
    <SocialLoginButtons compact returnToConnections={linkAfterLogin} />
    <div className="auth-divider"><span>or</span></div>
    {linkAfterLogin && <p className="auth-link-context">Sign in using your existing password or an already linked provider. You can link another sign-in method on the next page.</p>}
    <form onSubmit={submit} className="auth-account-form">
      {error && <p role="alert" className="auth-account-error">{error}</p>}
      {mode === 'signup' && <div className="auth-name-fields">
        <div><Label htmlFor="first-name">First name</Label><Input id="first-name" autoComplete="given-name" required maxLength={150} placeholder="First name" value={firstName} onChange={event => setFirstName(event.target.value)} /></div>
        <div><Label htmlFor="last-name">Last name</Label><Input id="last-name" autoComplete="family-name" required maxLength={150} placeholder="Last name" value={lastName} onChange={event => setLastName(event.target.value)} /></div>
      </div>}
      <div><Label htmlFor="email">Email address</Label><Input id="email" type="email" autoComplete="email" required placeholder="Enter your email address" value={email} readOnly={mode === 'login' && loginStep === 'password'} onChange={event => setEmail(event.target.value)} />
        {mode === 'login' && loginStep === 'password' && <button type="button" className="auth-text-action" onClick={() => { setLoginStep('email'); setPassword(''); setError('') }}>Edit email</button>}
      </div>
      {mode === 'signup' && <div><Label htmlFor="username">Public username</Label><Input id="username" autoComplete="username" required maxLength={150} placeholder="Choose a public username" value={username} onChange={event => setUsername(event.target.value)} /></div>}
      {(mode === 'signup' || loginStep === 'password') && <div><Label htmlFor="password">Password</Label>
        <div className="auth-password-field"><Input id="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 12 : undefined} placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} autoFocus={mode === 'login'} />
          <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
        </div>
        {mode === 'signup' ? <p className="auth-field-hint">Use at least 12 characters.</p> : <button type="button" className="auth-text-action" onClick={() => navigate('forgot-password')}>Forgot password?</button>}
      </div>}
      <Button className="auth-continue" disabled={loading} type="submit">{loading ? 'Please wait…' : 'Continue'}<ArrowRight aria-hidden="true" /></Button>
      {mode === 'login' && loginStep === 'email' && <button type="button" className="auth-text-action" onClick={() => navigate('forgot-password')}>Forgot password?</button>}
    </form>
    <details className="auth-link-help"><summary>Link a provider to an existing account</summary><p>Sign in with your current method, then <a href="/auth/connections">link Google or GitHub to your existing account</a>.</p></details>
  </AuthAccountPanel>
  return <div className="auth-shell min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>{titles[mode]}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="auth-form">
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {message && <p role="status" className="text-green-800">{message}</p>}
          {mode === 'verification-sent' && <>
            <p>Check your inbox for the next step. For a new account, open the verification link. If an account already exists, the email explains how to sign in and link Google or GitHub.</p>
            <a className="block underline" href="/auth/login?next=connections">Sign in to link a provider to an existing account</a>
            <Button type="button" disabled={loading} onClick={resend}>Resend verification email</Button>
          </>}
          {!completed && <>
            {mode === 'forgot-password' && <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>}
            {mode === 'change-password' && <div>
              <Label htmlFor="current-password">Current password</Label>
              <Input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            </div>}
            {usesPassword && <div>
              <Label htmlFor="password">New password (at least 12 characters)</Label>
              <Input id="password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e => setPassword(e.target.value)} />
            </div>}
            {usesPassword && <div>
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} />
            </div>}
            {mode !== 'verification-sent' && <Button className="auth-continue w-full" disabled={loading} type="submit">{loading ? 'Please wait…' : mode === 'forgot-password' ? 'Send reset link' : mode === 'reset-password' ? 'Reset password' : titles[mode]}</Button>}
          </>}
          <div className="auth-form-actions">
            <Button variant="link" type="button" onClick={() => navigate('login')}>Sign in</Button>
            {mode === 'reset-password' && <Button variant="link" type="button" onClick={() => navigate('forgot-password')}>Request another reset link</Button>}
          </div>
          <Button variant="ghost" type="button" onClick={backHome}>Back to home</Button>
        </form>
      </CardContent>
    </Card>
  </div>
}
