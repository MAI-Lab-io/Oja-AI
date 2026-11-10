import React, { useRef } from 'react'
import { ArrowLeft, Brain } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

export function AuthAccountPanel({ mode, open, onOpenChange, onNavigate, onBack, children }: {
  mode: 'login' | 'signup'; open: boolean; onOpenChange: (open: boolean) => void
  onNavigate: (mode: 'login' | 'signup') => void; onBack: () => void; children: React.ReactNode
}) {
  const signIn = useRef<HTMLButtonElement>(null)
  return <main className="auth-entry-page">
    <section className="auth-entry-card" aria-label="Access Oja AI">
      <a href="/" className="auth-entry-logo" aria-label={'\u1ECCJ\u00C0 AI home'}><Brain aria-hidden="true" /></a>
      <h1>{'\u1ECCJ\u00C0 AI'}</h1>
      <p>Sign in to access the platform</p>
      <div className="auth-entry-actions">
        <Button ref={signIn} className="auth-entry-signin" onClick={() => onNavigate('login')}>Sign In</Button>
        <Button variant="outline" onClick={() => onNavigate('signup')}>Sign Up</Button>
      </div>
      <Button variant="ghost" className="auth-entry-back" onClick={onBack}><ArrowLeft aria-hidden="true" />Back to Home</Button>
    </section>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="auth-account-dialog"
        onOpenAutoFocus={event => { event.preventDefault(); document.getElementById('email')?.focus() }}
        onCloseAutoFocus={event => { event.preventDefault(); signIn.current?.focus() }}>
        <div className="auth-account-main">
          <DialogHeader className="auth-account-heading">
            <DialogTitle>{mode === 'login' ? 'Sign in to Oja AI' : 'Create your account'}</DialogTitle>
            <DialogDescription>{mode === 'login' ? 'Welcome back! Please sign in to continue' : 'Welcome! Please fill in the details to get started.'}</DialogDescription>
          </DialogHeader>
          {children}
        </div>
        <footer className="auth-account-footer">
          {mode === 'login' ? <>Don’t have an account? <button type="button" onClick={() => onNavigate('signup')}>Sign up</button></> : <>Already have an account? <button type="button" onClick={() => onNavigate('login')}>Sign in</button></>}
        </footer>
      </DialogContent>
    </Dialog>
  </main>
}
