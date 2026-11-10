import React, { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SocialAuth, SocialLoginButtons } from './SocialAuth'
import { ApiError, apiRequest, csrfHeaders } from '../lib/api'
import { useAuth } from '../auth/AuthContext'

vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../lib/api')>(), apiRequest: vi.fn(), csrfHeaders: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
beforeEach(() => {
  window.history.replaceState({}, '', '/auth/login')
  vi.mocked(useAuth).mockReturnValue({ user: null, isLoaded: true, refresh: vi.fn() } as any)
  vi.mocked(csrfHeaders).mockResolvedValue({ 'X-CSRFToken': 'csrf-token' })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks() })

describe('Provider sign-in', () => {
  it('posts a CSRF-protected browser form to start Google login', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ data: { socialaccount: { providers: [{ id: 'google' }, { id: 'orcid' }] } } })
    let submitted: Record<string, FormDataEntryValue> | undefined
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      expect(this.method).toBe('post')
      expect(this.getAttribute('action')).toBe('/_allauth/browser/v1/auth/provider/redirect')
      submitted = Object.fromEntries(new FormData(this))
    })
    render(<SocialLoginButtons />)
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(submit).toHaveBeenCalledOnce()
    expect(csrfHeaders).toHaveBeenCalledWith(true)
    expect(submitted).toEqual({ provider: 'google', process: 'login', callback_url: 'http://localhost:3000/auth/provider-callback', csrfmiddlewaretoken: 'csrf-token' })
  })

  it('disables providers whose credentials are unavailable', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ data: { socialaccount: { providers: [] } } })
    render(<SocialLoginButtons />)
    await screen.findByText('Provider sign-in is not available yet.')
    expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Continue with ORCID' })).toBeNull()
  })

  it('starts the configured GitHub browser flow from the compact provider button', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ data: { socialaccount: { providers: [{ id: 'github' }, { id: 'google' }] } } })
    let submitted: Record<string, FormDataEntryValue> | undefined
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) { submitted = Object.fromEntries(new FormData(this)) })
    render(<SocialLoginButtons compact />)
    const github = screen.getByRole('button', { name: 'Continue with GitHub' }) as HTMLButtonElement
    await vi.waitFor(() => expect(github.disabled).toBe(false))
    await userEvent.click(github)
    expect(submitted).toMatchObject({ provider: 'github', process: 'login', csrfmiddlewaretoken: 'csrf-token' })
  })

  it('keeps the linking destination when signing in with an already linked provider', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ data: { socialaccount: { providers: [{ id: 'google' }] } } })
    let submitted: Record<string, FormDataEntryValue> | undefined
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) { submitted = Object.fromEntries(new FormData(this)) })
    render(<SocialLoginButtons returnToConnections />)
    const button = screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    await userEvent.click(button)
    expect(submitted).toMatchObject({ process: 'login', callback_url: 'http://localhost:3000/auth/provider-callback?next=connections' })
  })

  it('collects a missing provider email and username without a password', async () => {
    window.history.replaceState({}, '', '/auth/provider-callback')
    vi.mocked(apiRequest).mockImplementation(async path => {
      if (path.endsWith('/session')) throw new ApiError(401, { data: { flows: [{ id: 'provider_signup', is_pending: true }] } })
      return { data: { user: { email: '', username: '' } } }
    })
    render(<SocialAuth />)
    await screen.findByRole('heading', { name: 'Complete your account' })
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Public username')).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('First name'), 'Research')
    await user.type(screen.getByLabelText('Last name'), 'User')
    await user.type(screen.getByLabelText('Email'), 'researcher@example.com')
    await user.type(screen.getByLabelText('Public username'), 'researcher')
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(400, { errors: [{ message: 'Choose another username.' }] }))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Choose another username.')
    expect(apiRequest).toHaveBeenLastCalledWith('/_allauth/browser/v1/auth/provider/signup', { method: 'POST', body: JSON.stringify({ email: 'researcher@example.com', username: 'researcher', first_name: 'Research', last_name: 'User' }) })
  })

  it('shows cancellation safely under React StrictMode', async () => {
    window.history.replaceState({}, '', '/auth/provider-callback?error=cancelled')
    render(<StrictMode><SocialAuth /></StrictMode>)
    expect((await screen.findByRole('alert')).textContent).toContain('cancelled')
    expect(apiRequest).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('only offers account linking to signed-in users', async () => {
    render(<SocialAuth connections />)
    expect(screen.getByText('Sign in with your existing account to link Google or GitHub.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Link Google' })).toBeNull()
    expect(apiRequest).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Sign in to link an account' }).getAttribute('href')).toBe('/auth/login?next=connections')
  })

  it('identifies the existing account and prevents relinking a linked provider', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'existing', email: 'researcher@example.com' }, isLoaded: true, refresh: vi.fn() } as any)
    vi.mocked(apiRequest).mockImplementation(async path => path.endsWith('/account/providers')
      ? { data: [{ provider: { id: 'google', name: 'Google' } }] }
      : { data: { socialaccount: { providers: [{ id: 'google' }, { id: 'orcid' }] } } })
    render(<SocialAuth connections />)
    expect(screen.getByText('researcher@example.com')).toBeTruthy()
    expect((await screen.findByRole('button', { name: 'Google linked' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Link ORCID/ })).toBeNull()
  })
})
