import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthForm } from './AuthForm'
import { ApiError, apiRequest } from '../lib/api'
import { useAuth } from '../auth/AuthContext'

vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../lib/api')>(), apiRequest: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  window.history.replaceState({}, '', '/auth/login')
  vi.mocked(useAuth).mockReturnValue({ refresh: vi.fn().mockResolvedValue(undefined) } as any)
  vi.mocked(apiRequest).mockResolvedValue({ data: { socialaccount: { providers: [] } } })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('offers password recovery on the first sign-in step and requests a generic reset email', async () => {
  const user = userEvent.setup()
  render(<AuthForm />)
  await user.type(screen.getByLabelText('Email address'), 'researcher@example.com')
  await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
  expect(window.location.pathname).toBe('/auth/forgot-password')
  expect(screen.getByLabelText('Email')).toHaveProperty('value', 'researcher@example.com')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(apiRequest).toHaveBeenLastCalledWith('/_allauth/browser/v1/auth/password/request', { method: 'POST', body: JSON.stringify({ email: 'researcher@example.com' }) })
  await screen.findByText(/If an account exists for that email, recovery instructions will be sent/)
})

it('resets a password using the email key without leaving the key in the address bar', async () => {
  const user = userEvent.setup()
  window.history.replaceState({}, '', '/auth/reset-password?key=test-reset-key')
  render(<AuthForm />)
  expect(window.location.search).toBe('')
  await user.type(screen.getByLabelText('New password (at least 12 characters)'), 'New-cedar-river-754!')
  await user.type(screen.getByLabelText('Confirm password'), 'New-cedar-river-754!')
  await user.click(screen.getByRole('button', { name: 'Reset password', exact: true }))
  await screen.findByText('Password updated. Sign in with your new password.')
  expect(apiRequest).toHaveBeenLastCalledWith('/_allauth/browser/v1/auth/password/reset', { method: 'POST', body: JSON.stringify({ key: 'test-reset-key', password: 'New-cedar-river-754!' }) })
})

it('offers a separate path for linking providers to existing accounts', async () => {
  render(<AuthForm />)
  await userEvent.click(screen.getByText('Link a provider to an existing account'))
  expect(screen.getByRole('link', { name: 'link Google or GitHub to your existing account' }).getAttribute('href')).toBe('/auth/connections')
})

it('returns an existing email/password user to account linking after login', async () => {
  window.history.replaceState({}, '', '/auth/login?next=connections')
  render(<AuthForm />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email address'), 'researcher@example.com')
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await user.type(screen.getByLabelText('Password'), 'Cedar-river-754!long')
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await vi.waitFor(() => expect(window.location.pathname).toBe('/auth/connections'))
  expect(useAuth().refresh).toHaveBeenCalled()
})

it('does not accept an arbitrary return URL after login', async () => {
  window.history.replaceState({}, '', '/auth/login?next=https://attacker.example')
  render(<AuthForm />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email address'), 'researcher@example.com')
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await user.type(screen.getByLabelText('Password'), 'Cedar-river-754!long')
  await user.click(screen.getByRole('button', { name: 'Continue', exact: true }))
  await vi.waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
})

it('shows the branded entry card and opens accessible sign-in and signup dialogs', async () => {
  window.history.replaceState({}, '', '/auth')
  render(<AuthForm />)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Sign in to access the platform')).toBeTruthy()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Sign In', exact: true }))
  const dialog = screen.getByRole('dialog', { name: 'Sign in to Oja AI' })
  expect(within(dialog).getByRole('button', { name: 'Continue with GitHub' })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  expect(within(dialog).queryByLabelText('Password')).toBeNull()
  await user.click(within(dialog).getByRole('button', { name: 'Sign up', exact: true }))
  expect(screen.getByRole('dialog', { name: 'Create your account' })).toBeTruthy()
  expect(screen.getByLabelText(/First name/)).toBeTruthy()
  expect(screen.getByLabelText(/Last name/)).toBeTruthy()
  expect(screen.getByLabelText('Public username')).toBeTruthy()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sign In', exact: true }))
})

it('advances from email to password without checking account existence', async () => {
  render(<AuthForm />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email address'), 'researcher@example.com')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByLabelText('Password')).toBeTruthy()
  expect(vi.mocked(apiRequest).mock.calls.every(([path]) => !String(path).endsWith('/auth/login'))).toBe(true)
  await user.type(screen.getByLabelText('Password'), 'Cedar-river-754!long')
  await user.click(screen.getByRole('button', { name: 'Show password' }))
  expect(screen.getByLabelText('Password').getAttribute('type')).toBe('text')
  await user.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password')
})

it('submits signup profile details and preserves email verification', async () => {
  window.history.replaceState({}, '', '/auth/signup')
  render(<AuthForm />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/First name/), 'Alice')
  await user.type(screen.getByLabelText(/Last name/), 'Researcher')
  await user.type(screen.getByLabelText('Email address'), 'alice@example.com')
  await user.type(screen.getByLabelText('Public username'), 'alice')
  await user.type(screen.getByLabelText('Password'), 'Cedar-river-754!long')
  vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(401, { data: { flows: [{ id: 'verify_email', is_pending: true }] } }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(apiRequest).toHaveBeenLastCalledWith('/_allauth/browser/v1/auth/signup', { method: 'POST', body: JSON.stringify({ email: 'alice@example.com', username: 'alice', password: 'Cedar-river-754!long', first_name: 'Alice', last_name: 'Researcher' }) })
  expect(window.location.pathname).toBe('/auth/verification-sent')
  expect(screen.getByRole('heading', { name: 'Check your email' })).toBeTruthy()
})

it('does not submit signup when first or last name is missing', async () => {
  window.history.replaceState({}, '', '/auth/signup')
  render(<AuthForm />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email address'), 'alice@example.com')
  await user.type(screen.getByLabelText('Public username'), 'alice')
  await user.type(screen.getByLabelText('Password'), 'Cedar-river-754!long')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => String(path).endsWith('/auth/signup'))).toBe(false)
  await user.type(screen.getByLabelText('First name'), 'Alice')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => String(path).endsWith('/auth/signup'))).toBe(false)
  expect(screen.queryByText('Optional')).toBeNull()
})
