import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppRouter } from '../AppRouter'
import { PublicModelZoo } from './PublicModelZoo'
import { apiRequest } from '../lib/api'
import { useAuth } from '../auth/AuthContext'

vi.mock('../lib/api', () => ({ apiRequest: vi.fn(), csrfHeaders: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../App', () => ({ default: () => <div>Account dashboard</div> }))

const model = { kind: 'model', visibility: 'public', id: 'model-1', name: 'SpeechNet', slug: 'speech-net', owner: 'alice', description: 'Speech recognition model', download_count: 7, latest_release: { id: 'version-1', version: '1.0.0', metadata: { task: 'speech-recognition', framework: 'pytorch', license: 'Apache-2.0' }, published_at: '2026-10-29T10:00:00Z', file_count: 1, total_size: 1024 } }
const published = { id: 'version-1', version: '1.0.0', status: 'published', metadata: model.latest_release.metadata, card: 'A published model card', sources: [], files: [{ id: 'file-1', path: 'weights.safetensors', size: 1024, status: 'ready', scan_status: 'clean', download_url: '/api/v1/artifacts/file-1/download/' }] }

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.mocked(useAuth).mockReturnValue({ user: null, isSignedIn: false, isLoaded: false, error: 'Account service unavailable' } as any)
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Legacy service requests are not allowed in the public browser.')))
  vi.mocked(apiRequest).mockImplementation(async path => {
    if (path === '/api/v1/statistics/') return { models: 1, datasets: 0, published_versions: 1, contributors: 1 }
    if (String(path).includes('/repositories/?')) return { results: [model], count: 1, next: null }
    if (path === '/api/v1/repositories/model-1/') return { ...model, kind: 'model', visibility: 'public' }
    if (path === '/api/v1/repositories/model-1/releases/') return [published, { ...published, id: 'draft-2', version: '2.0.0', status: 'draft' }]
    throw new Error(`Unexpected public request: ${path}`)
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('Public Oja Models', () => {
  it.each([['/model-zoo', '/models', 'Oja Models'], ['/data-zoo', '/datasets', 'Oja Datasets']])('redirects the legacy catalog %s to %s', async (oldPath, newPath, heading) => {
    window.history.replaceState({}, '', oldPath)
    render(<AppRouter />)
    await screen.findByRole('heading', { name: heading, exact: true })
    await waitFor(() => expect(window.location.pathname).toBe(newPath))
  })
  it('refreshes counts and most-downloaded ordering when returning from review', async () => {
    let downloads = 1
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation((path, options) => String(path).includes('/repositories/?')
      ? Promise.resolve({ results: [{ ...model, download_count: downloads }, { ...model, id: 'other', name: 'Other entry', download_count: 3 }], count: 2, next: null })
      : original(path, options))
    const user = userEvent.setup()
    render(<PublicModelZoo />)
    await screen.findByText('Other entry')
    await user.click(screen.getByRole('button', { name: 'model table view' }))
    await user.selectOptions(screen.getByLabelText('Sort models'), 'popular')
    const names = () => within(screen.getByRole('table', { name: 'Public models' })).getAllByRole('row').slice(1).map(row => row.querySelector('strong')?.textContent)
    await waitFor(() => expect(names()[0]).toBe('Other entry'))
    await user.click(screen.getByRole('button', { name: 'View model SpeechNet' }))
    await screen.findByRole('link', { name: /^Download/ })
    downloads = 8
    await user.click(screen.getByRole('button', { name: 'Back to model list' }))
    await waitFor(() => expect(names()[0]).toBe(model.name))
    expect(within(screen.getByRole('table', { name: 'Public models' })).getByRole('cell', { name: '8', exact: true })).toBeTruthy()
    expect(screen.getByLabelText('Sort models')).toHaveProperty('value', 'popular')
  })
  it('orders multiple models by name, completed downloads and latest release, requesting global API ordering', async () => {
    const rows = [
      { ...model, id: 'z', name: 'Zeta', download_count: 9, latest_release: { ...model.latest_release, published_at: '2026-11-01T00:00:00Z' } },
      { ...model, id: 'a', name: 'alpha', download_count: 2, latest_release: { ...model.latest_release, published_at: '2026-10-01T00:00:00Z' } },
      { ...model, id: 'b', name: 'Beta', download_count: 4, latest_release: { ...model.latest_release, published_at: '2026-11-05T00:00:00Z' } },
    ]
    vi.mocked(apiRequest).mockResolvedValue({ results: rows, count: 3, next: null })
    const user = userEvent.setup()
    render(<PublicModelZoo />)
    await screen.findByText('Zeta')
    await user.click(screen.getByRole('button', { name: 'model table view' }))
    const names = () => within(screen.getByRole('table', { name: 'Public models' })).getAllByRole('row').slice(1).map(row => row.querySelector('strong')?.textContent)
    await waitFor(() => expect(names()).toEqual(['Beta', 'Zeta', 'alpha']))
    await user.selectOptions(screen.getByLabelText('Sort models'), 'name')
    await waitFor(() => expect(names()).toEqual(['alpha', 'Beta', 'Zeta']))
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('ordering=name'))
    await user.selectOptions(screen.getByLabelText('Sort models'), 'popular')
    await waitFor(() => expect(names()).toEqual(['Zeta', 'Beta', 'alpha']))
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('ordering=downloads'))
    await user.selectOptions(screen.getByLabelText('Sort models'), 'newest')
    await waitFor(() => expect(names()).toEqual(['Beta', 'Zeta', 'alpha']))
  })
  it('matches dataset detail tabs and preserves the active model Files tab on refresh', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/models')
    const first = render(<AppRouter />)
    await user.click(await screen.findByRole('button', { name: 'View Model', exact: true }))
    await screen.findByText('A published model card')
    for (const name of ['Overview', 'Schema', 'Files', 'Provenance']) expect(screen.getByRole('tab', { name, exact: true })).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Files', exact: true }))
    expect(new URLSearchParams(window.location.search).get('section')).toBe('files')
    first.unmount()
    render(<AppRouter />)
    await screen.findByRole('link', { name: 'Download weights.safetensors' })
    expect(screen.getByRole('tab', { name: 'Files', exact: true }).getAttribute('aria-selected')).toBe('true')
  })
  it('shows, hides and restores model columns, keeping preferences after remount', async () => {
    const user = userEvent.setup()
    const first = render(<PublicModelZoo />)
    await screen.findByText('SpeechNet')
    await user.click(screen.getByRole('button', { name: 'model table view' }))
    await user.click(screen.getByRole('button', { name: 'Model table columns' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Framework', exact: true }))
    await user.keyboard('{Escape}')
    let table = screen.getByRole('table', { name: 'Public models' })
    expect(within(table).queryByRole('columnheader', { name: 'Framework' })).toBeNull()
    expect(within(table).queryByText('pytorch')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'model card view' }))
    await user.click(screen.getByRole('button', { name: 'model table view' }))
    expect(within(screen.getByRole('table', { name: 'Public models' })).queryByRole('columnheader', { name: 'Framework' })).toBeNull()
    first.unmount()
    render(<PublicModelZoo />)
    await screen.findByText('SpeechNet')
    await user.click(screen.getByRole('button', { name: 'model table view' }))
    table = screen.getByRole('table', { name: 'Public models' })
    expect(within(table).queryByRole('columnheader', { name: 'Framework' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Model table columns' }))
    await user.click(screen.getByRole('menuitem', { name: 'Restore default columns' }))
    expect(within(table).getByRole('columnheader', { name: 'Framework' })).toBeTruthy()
  })
  it('offers model downloads only after review and displays stored counts in both layouts', async () => {
    const user = userEvent.setup()
    render(<PublicModelZoo />)
    await screen.findByText('SpeechNet')
    expect(screen.getByText('Downloads')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'model table view' }))
    const table = screen.getByRole('table', { name: 'Public models' })
    expect(within(table).getByRole('columnheader', { name: 'Downloads' })).toBeTruthy()
    expect(within(table).getByRole('cell', { name: '7', exact: true })).toBeTruthy()
    expect(within(table).queryByRole('link', { name: /Download/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'View model SpeechNet' }))
    expect((await screen.findByRole('link', { name: /^Download Model \([\d,]+\)$/ })).getAttribute('href')).toBe('/api/v1/releases/version-1/download/')
    expect(vi.mocked(apiRequest).mock.calls.every(([path]) => !String(path).includes('/auth/'))).toBe(true)
  })
  it('retains a reviewed model and selected version when the page remounts', async () => {
    const user = userEvent.setup()
    const older = { ...published, id: 'older-model', version: '0.9.0', card: 'Earlier model documentation' }
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation((path, options) => path === '/api/v1/repositories/model-1/releases/' ? Promise.resolve([published, older]) : original(path, options))
    window.history.replaceState({}, '', '/models')
    const first = render(<AppRouter />)
    await user.click(await screen.findByRole('button', { name: 'View Model', exact: true }))
    await screen.findByText('A published model card')
    await user.selectOptions(screen.getByLabelText('Version'), 'older-model')
    await screen.findByText('Earlier model documentation')
    expect(window.location.pathname).toBe('/models/alice/speech-net')
    expect(new URLSearchParams(window.location.search).get('version')).toBe('0.9.0')
    first.unmount()
    render(<AppRouter />)
    await screen.findByText('Earlier model documentation')
    expect(screen.getByLabelText('Version')).toHaveProperty('value', 'older-model')
    await user.click(screen.getByRole('button', { name: 'Back to model list' }))
    expect(window.location.search).toBe('')
    expect(screen.getByRole('button', { name: 'View Model', exact: true })).toBeTruthy()
  })
  it('opens Models and Datasets from Browse market without zoo links in the header', async () => {
    const user = userEvent.setup()
    vi.mocked(apiRequest).mockImplementation(async path => {
      if (String(path).includes('kind=dataset')) return { results: [{ ...model, id: 'dataset-1', name: 'Test Dataset', latest_release: { ...model.latest_release, metadata: { task: 'classification', modality: 'tabular', license: 'CC0-1.0' } } }], count: 1, next: null }
      if (String(path).includes('kind=model')) return { results: [model], count: 1, next: null }
      if (path === '/api/v1/statistics/') return { models: 1, datasets: 1, published_versions: 2, contributors: 1 }
      throw new Error(`Unexpected request: ${path}`)
    })
    render(<AppRouter />)
    const header = screen.getByRole('banner')
    expect(within(header).queryByRole('link', { name: /Oja Models|Oja Datasets/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Browse market' }))
    await screen.findByText('SpeechNet')
    expect(screen.getByRole('tab', { name: 'Oja Models', exact: true }).getAttribute('aria-selected')).toBe('true')
    await user.click(screen.getByRole('tab', { name: 'Oja Datasets', exact: true }))
    await screen.findByText('Test Dataset')
    expect(window.location.pathname).toBe('/datasets')
    expect(screen.queryByText('SpeechNet')).toBeNull()
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: 'Oja Models' })).toBeNull()
    act(() => {
      window.history.replaceState({}, '', '/models')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await screen.findByText('SpeechNet')
    expect(screen.getByRole('tab', { name: 'Oja Models', exact: true }).getAttribute('aria-selected')).toBe('true')
  })
  it('keeps the home page accessible when signed in and opens contributions through Dashboard', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'alice', name: 'Alice', email: 'alice@example.com' }, isSignedIn: true, isLoaded: true } as any)
    render(<AppRouter />)
    expect(screen.getByRole('heading', { name: /Welcome to/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ỌJÀ AI home' }).getAttribute('href')).toBe('/')
    await userEvent.click(screen.getAllByRole('button', { name: 'Go to Dashboard' })[0])
    expect(window.location.pathname).toBe('/dashboard')
    await screen.findByText('Account dashboard')
  })
  it('Browse market opens the original model browser and filters without login', async () => {
    const user = userEvent.setup()
    render(<AppRouter />)
    await user.click(screen.getByRole('button', { name: 'Browse market' }))
    expect(window.location.pathname).toBe('/models')
    const browser = await screen.findByRole('region', { name: 'Oja Models browser' })
    await within(browser).findByText('SpeechNet')
    expect(within(browser).getByText('Tasks')).toBeTruthy()
    expect(within(browser).getByText('Model Sources')).toBeTruthy()
    expect(within(browser).getByRole('option', { name: 'Most downloaded' })).toBeTruthy()
    expect(within(browser).getByText('alice/speech-net')).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(vi.mocked(apiRequest).mock.calls.every(([path]) => !String(path).includes('/auth/'))).toBe(true)
  })

  it('supports opening /model-zoo directly without an account', async () => {
    window.history.replaceState({}, '', '/models')
    render(<AppRouter />)
    await screen.findByText('SpeechNet')
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy()
  })

  it('lets anonymous visitors view published cards and download links without showing drafts', async () => {
    const user = userEvent.setup()
    render(<PublicModelZoo />)
    await user.click(await screen.findByRole('button', { name: 'View Model' }))
    await screen.findByText('A published model card')
    await user.click(screen.getByRole('tab', { name: 'Files', exact: true }))
    expect(screen.getByRole('link', { name: 'Download weights.safetensors' }).getAttribute('href')).toBe('/api/v1/artifacts/file-1/download/')
    expect(screen.queryByRole('option', { name: '2.0.0' })).toBeNull()
  })

  it('keeps the original sidebar filters visible when the catalog is empty', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ results: [], count: 0, next: null })
    render(<PublicModelZoo />)
    await screen.findByText('No models found')
    expect(screen.getByText('Tasks')).toBeTruthy()
    expect(screen.getByText('Model Sources')).toBeTruthy()
    expect(screen.getByRole('button', { name: /All Models/ })).toBeTruthy()
  })

  it('restores working task and model-source filters', async () => {
    const user = userEvent.setup()
    render(<PublicModelZoo />)
    await screen.findByText('SpeechNet')
    await user.click(screen.getByRole('button', { name: /Classification/ }))
    await screen.findByText('No models found')
    await user.click(screen.getByRole('button', { name: /All Models/ }))
    await screen.findByText('SpeechNet')
    await user.click(screen.getByRole('checkbox', { name: /Community/ }))
    await screen.findByText('No models found')
    await user.click(screen.getByRole('checkbox', { name: /Community/ }))
    await screen.findByText('SpeechNet')
  })

  it('allows anonymous metadata comparison without calling legacy account APIs', async () => {
    const user = userEvent.setup()
    render(<PublicModelZoo />)
    await user.click(await screen.findByRole('checkbox', { name: 'Select SpeechNet' }))
    await user.click(screen.getByRole('button', { name: 'Compare Selected' }))
    const comparison = screen.getByRole('table', { name: 'Selected model comparison' })
    expect(within(comparison).getByText('SpeechNet')).toBeTruthy()
    expect(within(comparison).getByText('pytorch')).toBeTruthy()
    expect(vi.mocked(apiRequest).mock.calls.every(([path]) => String(path).startsWith('/api/v1/repositories/'))).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves model filters and comparison selection across card and table views', async () => {
    const user = userEvent.setup()
    render(<PublicModelZoo />)
    await screen.findByText('SpeechNet')
    await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'Speech')
    await user.click(screen.getByRole('checkbox', { name: 'Select SpeechNet' }))
    await user.click(screen.getByRole('button', { name: 'model table view' }))
    const table = screen.getByRole('table', { name: 'Public models' })
    expect(within(table).getByText('SpeechNet')).toBeTruthy()
    expect(within(table).getByRole('checkbox', { name: 'Select SpeechNet' }).getAttribute('data-state')).toBe('checked')
    await user.click(screen.getByRole('button', { name: 'model card view' }))
    expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveProperty('value', 'Speech')
    expect(screen.getByRole('checkbox', { name: 'Select SpeechNet' }).getAttribute('data-state')).toBe('checked')
    await user.click(screen.getByRole('button', { name: 'model table view' }))
    await user.click(screen.getByRole('button', { name: 'View model SpeechNet' }))
    await screen.findByText('A published model card')
    await user.click(screen.getByRole('button', { name: 'Back to model list' }))
    expect(screen.getByRole('table', { name: 'Public models' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveProperty('value', 'Speech')
  })
})
