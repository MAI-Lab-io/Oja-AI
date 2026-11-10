import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublicDataZoo } from './PublicDataZoo'
import { AppRouter } from '../AppRouter'
import { apiRequest } from '../lib/api'
import { useAuth } from '../auth/AuthContext'

vi.mock('../lib/api', () => ({ apiRequest: vi.fn(), csrfHeaders: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../App', () => ({ default: () => <div>Account dashboard</div> }))

const dataset = { kind: 'dataset', visibility: 'public', id: 'dataset-1', name: 'Customer Churn Demo', slug: 'churn', owner: 'alice', description: 'Synthetic customer records', download_count: 13, latest_release: { id: 'release-1', version: '1.0.0', metadata: { task: 'classification', modality: 'tabular', license: 'CC0-1.0', tags: ['churn'], splits: { train: 70, test: 30 }, features: [{ name: 'age', dtype: 'integer' }] }, published_at: '2026-11-05T08:00:00Z', file_count: 1, total_size: 2048 } }
const second = { ...dataset, id: 'dataset-2', name: 'Speech Samples', latest_release: { ...dataset.latest_release, metadata: { task: 'speech-recognition', modality: 'audio', license: 'MIT' } } }
const published = { id: 'release-1', version: '1.0.0', status: 'published', published_at: dataset.latest_release.published_at, metadata: dataset.latest_release.metadata, card: '# Published dataset documentation\n\nA **synthetic** dataset.\n\n- Training examples\n- Test examples', sources: [], files: [
  { id: 'file-1', path: 'train.csv', size: 2048, status: 'ready', scan_status: 'not_scanned', download_url: '/api/v1/artifacts/file-1/download/' },
  { id: 'file-2', path: 'unfinished.csv', status: 'pending' },
] }

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.mocked(useAuth).mockReturnValue({ user: null, isSignedIn: false, isLoaded: false, error: 'Account service unavailable' } as any)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No legacy API calls expected')))
  vi.mocked(apiRequest).mockImplementation(async path => {
    if (String(path).includes('/repositories/?')) return { results: [dataset, second], count: 2, next: null }
    if (path === '/api/v1/repositories/dataset-1/') return { ...dataset, kind: 'dataset', visibility: 'public' }
    if (path === '/api/v1/repositories/dataset-1/releases/') return [published, { ...published, id: 'draft-2', version: '2.0.0', status: 'draft', card: 'Secret draft' }]
    throw new Error(`Unexpected request: ${path}`)
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('Public Oja Datasets', () => {
  it('refreshes counts and most-downloaded ordering when returning from review', async () => {
    let downloads = 1
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation((path, options) => String(path).includes('/repositories/?')
      ? Promise.resolve({ results: [{ ...dataset, download_count: downloads }, { ...dataset, id: 'other', name: 'Other entry', download_count: 3 }], count: 2, next: null })
      : original(path, options))
    const user = userEvent.setup()
    render(<PublicDataZoo />)
    await screen.findByText('Other entry')
    await user.click(screen.getByRole('button', { name: 'dataset table view' }))
    await user.selectOptions(screen.getByLabelText('Sort datasets'), 'downloads')
    const names = () => within(screen.getByRole('table', { name: 'Public datasets' })).getAllByRole('row').slice(1).map(row => row.querySelector('strong')?.textContent)
    await waitFor(() => expect(names()[0]).toBe('Other entry'))
    await user.click(screen.getByRole('button', { name: 'View dataset Customer Churn Demo' }))
    await screen.findByRole('link', { name: /^Download/ })
    downloads = 8
    await user.click(screen.getByRole('button', { name: 'Back to dataset list' }))
    await waitFor(() => expect(names()[0]).toBe(dataset.name))
    expect(within(screen.getByRole('table', { name: 'Public datasets' })).getByRole('cell', { name: '8', exact: true })).toBeTruthy()
    expect(screen.getByLabelText('Sort datasets')).toHaveProperty('value', 'downloads')
  })
  it('orders multiple datasets by name, completed downloads and latest release in both views', async () => {
    const rows = [
      { ...dataset, id: 'z', name: 'Zeta', download_count: 9, latest_release: { ...dataset.latest_release, published_at: '2026-10-01T00:00:00Z' } },
      { ...dataset, id: 'a', name: 'alpha', download_count: 2, latest_release: { ...dataset.latest_release, published_at: '2026-11-01T00:00:00Z' } },
      { ...dataset, id: 'b', name: 'Beta', download_count: 4, latest_release: { ...dataset.latest_release, published_at: '2026-11-05T00:00:00Z' } },
    ]
    vi.mocked(apiRequest).mockResolvedValue({ results: rows, count: 3, next: null })
    const user = userEvent.setup()
    render(<PublicDataZoo />)
    await screen.findByText('Zeta')
    await user.click(screen.getByRole('button', { name: 'dataset table view' }))
    const names = () => within(screen.getByRole('table', { name: 'Public datasets' })).getAllByRole('row').slice(1).map(row => row.querySelector('strong')?.textContent)
    await waitFor(() => expect(names()).toEqual(['Beta', 'alpha', 'Zeta']))
    await user.selectOptions(screen.getByLabelText('Sort datasets'), 'name')
    await waitFor(() => expect(names()).toEqual(['alpha', 'Beta', 'Zeta']))
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('ordering=name'))
    await user.selectOptions(screen.getByLabelText('Sort datasets'), 'downloads')
    await waitFor(() => expect(names()).toEqual(['Zeta', 'Beta', 'alpha']))
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('ordering=downloads'))
    await user.selectOptions(screen.getByLabelText('Sort datasets'), 'newest')
    await waitFor(() => expect(names()).toEqual(['Beta', 'alpha', 'Zeta']))
  })
  it('hides multiple dataset columns without misaligning rows and restores defaults', async () => {
    const user = userEvent.setup()
    render(<PublicDataZoo />)
    await screen.findByText('Customer Churn Demo')
    await user.click(screen.getByRole('button', { name: 'dataset table view' }))
    await user.click(screen.getByRole('button', { name: 'Dataset table columns' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Size', exact: true }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Files', exact: true }))
    await user.keyboard('{Escape}')
    const table = screen.getByRole('table', { name: 'Public datasets' })
    expect(within(table).queryByRole('columnheader', { name: 'Size', exact: true })).toBeNull()
    expect(within(table).queryByRole('columnheader', { name: 'Files', exact: true })).toBeNull()
    const headers = within(table).getAllByRole('columnheader')
    for (const row of within(table).getAllByRole('row').slice(1)) expect(within(row).getAllByRole('cell')).toHaveLength(headers.length)
    await user.click(screen.getByRole('button', { name: 'Dataset table columns' }))
    await user.click(screen.getByRole('menuitem', { name: 'Restore default columns' }))
    expect(within(table).getByRole('columnheader', { name: 'Files', exact: true })).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: 'Size', exact: true })).toBeTruthy()
  })
  it('offers dataset downloads only after review and uses stored counts in each view', async () => {
    const user = userEvent.setup()
    render(<PublicDataZoo />)
    await screen.findByText('Customer Churn Demo')
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'dataset table view' }))
    const table = screen.getByRole('table', { name: 'Public datasets' })
    expect(within(table).getByRole('columnheader', { name: 'Downloads' })).toBeTruthy()
    expect(within(table).getAllByRole('cell', { name: '13', exact: true })).toHaveLength(2)
    expect(within(table).queryByRole('link', { name: /Download/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'View dataset Customer Churn Demo' }))
    expect((await screen.findByRole('link', { name: /^Download Dataset \([\d,]+\)$/ })).getAttribute('href')).toBe('/api/v1/releases/release-1/download/')
    expect(screen.getByRole('link', { name: 'Download Dataset (13)' })).toBeTruthy()
  })
  it('keeps the repository, release and active detail tab after a full remount', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/datasets')
    const first = render(<AppRouter />)
    await user.click(await screen.findByRole('button', { name: 'View dataset Customer Churn Demo' }))
    await screen.findByText('Published dataset documentation')
    expect(window.location.pathname).toBe('/datasets/alice/churn')
    expect(new URLSearchParams(window.location.search).get('version')).toBe('1.0.0')
    await user.click(screen.getByRole('tab', { name: 'Files', exact: true }))
    expect(new URLSearchParams(window.location.search).get('section')).toBe('files')
    first.unmount()
    render(<AppRouter />)
    await screen.findByRole('link', { name: 'Download train.csv' })
    expect(screen.getByRole('tab', { name: 'Files', exact: true }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByLabelText('Version')).toHaveProperty('value', 'release-1')
    expect(screen.queryByRole('button', { name: 'View dataset Customer Churn Demo' })).toBeNull()
  })

  it('loads a direct link to a repository and version outside the loaded catalog/version pages', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (String(path).includes('/repositories/?') && !String(path).includes('owner=')) return { results: [], count: 0, next: null }
      if (path === '/api/v1/repositories/dataset-1/releases/?version=0.9.0') return [{ ...published, repository: dataset.id, id: 'older-release', version: '0.9.0', card: 'Older published dataset' }]
      if (path === '/api/v1/releases/older-release/') return { ...published, repository: dataset.id, id: 'older-release', version: '0.9.0', card: 'Older published dataset' }
      return original(path, options)
    })
    window.history.replaceState({}, '', '/data-zoo?repository=dataset-1&release=older-release')
    render(<AppRouter />)
    await screen.findByText('Older published dataset')
    expect(screen.getByLabelText('Version')).toHaveProperty('value', 'older-release')
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/repositories/dataset-1/')
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/releases/older-release/')
  })

  it('loads a readable link to an older version beyond the first page', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation((path, options) => path === '/api/v1/repositories/dataset-1/releases/?version=0.8.0'
      ? Promise.resolve([{ ...published, id: 'old', repository: dataset.id, version: '0.8.0', card: 'Readable old release' }]) : original(path, options))
    window.history.replaceState({}, '', '/datasets/alice/churn?version=0.8.0&section=files')
    render(<AppRouter />)
    await screen.findByRole('link', { name: 'Download train.csv' })
    expect(screen.getByLabelText('Version')).toHaveProperty('value', 'old')
    expect(screen.getByRole('tab', { name: 'Files', exact: true }).getAttribute('aria-selected')).toBe('true')
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('owner=alice&slug=churn'))
  })
  it('rejects unknown or draft version names without showing the latest release', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation((path, options) => String(path).includes('releases/?version=')
      ? Promise.resolve([{ ...published, repository: dataset.id, version: '2.0.0', status: 'draft' }]) : original(path, options))
    window.history.replaceState({}, '', '/datasets/alice/churn?version=2.0.0')
    render(<AppRouter />)
    expect((await screen.findByRole('alert')).textContent).toContain('requested published version is unavailable')
    expect(screen.queryByText('Published dataset documentation')).toBeNull()
  })

  it('does not display an owner-accessible private repository from a public detail link', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation((path, options) => path === '/api/v1/repositories/dataset-1/' ? Promise.resolve({ ...dataset, kind: 'dataset', visibility: 'private' }) : original(path, options))
    window.history.replaceState({}, '', '/data-zoo?repository=dataset-1&release=release-1')
    render(<AppRouter />)
    expect((await screen.findByRole('alert')).textContent).toContain('public dataset is unavailable')
    expect(screen.queryByText('Published dataset documentation')).toBeNull()
  })

  it('rejects a direct link to a draft release without falling back to another version', async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation((path, options) => path === '/api/v1/releases/draft-2/' ? Promise.resolve({ ...published, repository: dataset.id, id: 'draft-2', status: 'draft', card: 'Secret draft' }) : original(path, options))
    window.history.replaceState({}, '', '/data-zoo?repository=dataset-1&release=draft-2')
    render(<AppRouter />)
    expect((await screen.findByRole('alert')).textContent).toContain('requested published version is unavailable')
    expect(screen.queryByText('Secret draft')).toBeNull()
    expect(screen.queryByText('Published dataset documentation')).toBeNull()
  })
  it('opens directly without waiting for accounts and requests only public datasets', async () => {
    window.history.replaceState({}, '', '/data-zoo/')
    render(<AppRouter />)
    await screen.findByText('Customer Churn Demo')
    expect(screen.getByRole('heading', { name: 'Oja Datasets' })).toBeTruthy()
    expect(screen.getByText('2 public datasets')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Oja Models', exact: true })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Oja Datasets', exact: true }).getAttribute('aria-selected')).toBe('true')
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/repositories/?kind=dataset&scope=public&limit=100&ordering=newest')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('combines task, data type, license and search filters and can reset them', async () => {
    const user = userEvent.setup()
    render(<PublicDataZoo />)
    await screen.findByText('Speech Samples')
    await user.click(screen.getByRole('button', { name: 'classification' }))
    expect(screen.queryByText('Speech Samples')).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'tabular' }))
    await user.selectOptions(screen.getByLabelText('Dataset license'), 'CC0-1.0')
    expect(screen.getByText('Customer Churn Demo')).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: 'Search datasets' }), 'missing')
    expect(screen.getByText('No datasets found')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('Speech Samples')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Sort datasets'), 'name')
    expect(screen.getAllByRole('button', { name: /View dataset / })[0].getAttribute('aria-label')).toBe('View dataset Customer Churn Demo')
  })

  it('shows published schema, exact release, manifest and ready downloads, excluding owner drafts', async () => {
    const user = userEvent.setup()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'alice' }, isSignedIn: true, isLoaded: true } as any)
    render(<PublicDataZoo />)
    await user.click(await screen.findByRole('button', { name: 'View dataset Customer Churn Demo' }))
    await screen.findByText('Published dataset documentation')
    expect(screen.getByRole('heading', { name: 'Published dataset documentation' })).toBeTruthy()
    expect(screen.getByText('synthetic').tagName).toBe('STRONG')
    expect(screen.queryByRole('option', { name: '2.0.0' })).toBeNull()
    expect(screen.queryByText('Secret draft')).toBeNull()
    expect(screen.queryByText('unfinished.csv')).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Schema', exact: true }))
    expect(within(screen.getByRole('table', { name: 'Dataset features' })).getByText('age')).toBeTruthy()
    expect(screen.getByText('70 declared examples')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Files', exact: true }))
    expect(screen.getByText('Not malware scanned')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Download train.csv' }).getAttribute('href')).toBe('/api/v1/artifacts/file-1/download/')
    await user.click(screen.getByRole('tab', { name: 'Provenance', exact: true }))
    expect(screen.getByText('release-1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View release manifest and checksums' }).getAttribute('href')).toBe('/api/v1/releases/release-1/manifest/')
    await user.click(screen.getByRole('button', { name: 'Back to dataset list' }))
    expect(screen.getByRole('region', { name: 'Oja Datasets browser' })).toBeTruthy()
  })

  it('keeps dataset filters when switching between cards and tables and opens details from a row', async () => {
    const user = userEvent.setup()
    render(<PublicDataZoo />)
    await screen.findByText('Customer Churn Demo')
    await user.type(screen.getByRole('textbox', { name: 'Search datasets' }), 'Customer Churn Demo')
    await user.click(screen.getByRole('button', { name: 'dataset table view' }))
    const table = screen.getByRole('table', { name: 'Public datasets' })
    expect(within(table).getByText('Customer Churn Demo')).toBeTruthy()
    expect(within(table).queryByText('Speech Samples')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'dataset card view' }))
    expect(screen.queryByRole('table', { name: 'Public datasets' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Search datasets' })).toHaveProperty('value', 'Customer Churn Demo')
    await user.click(screen.getByRole('button', { name: 'dataset table view' }))
    await user.click(screen.getByRole('button', { name: 'View dataset Customer Churn Demo' }))
    await screen.findByRole('heading', { name: 'Published dataset documentation' })
  })

  it('loads additional public pages and includes them in filters', async () => {
    const user = userEvent.setup()
    vi.mocked(apiRequest).mockResolvedValueOnce({ results: [dataset], count: 2, next: 'http://localhost:8000/api/v1/repositories/?kind=dataset&scope=public&limit=100&offset=100' }).mockResolvedValueOnce({ results: [second], count: 2, next: null })
    render(<PublicDataZoo />)
    await user.click(await screen.findByRole('button', { name: 'Load more datasets' }))
    await screen.findByText('Speech Samples')
    expect(screen.getByText('Showing 2 of 2 loaded datasets.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load more datasets' })).toBeNull()
    expect(apiRequest).toHaveBeenLastCalledWith('/api/v1/repositories/?kind=dataset&scope=public&limit=100&offset=100')
  })

  it('shows an actionable error and refreshes after the service recovers', async () => {
    const user = userEvent.setup()
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Dataset service unavailable'))
    render(<PublicDataZoo />)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Dataset service unavailable')
    await user.click(screen.getByRole('button', { name: 'Refresh datasets' }))
    await screen.findByText('Customer Churn Demo')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retains filters in an empty catalog and requires an account to contribute', async () => {
    const user = userEvent.setup()
    vi.mocked(apiRequest).mockResolvedValue({ results: [], count: 0, next: null })
    render(<PublicDataZoo />)
    await screen.findByText('No datasets found')
    expect(screen.getByText('Tasks')).toBeTruthy()
    expect(screen.getByText('Data Types')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Contribute' }))
    expect(screen.getByRole('link', { name: 'Sign in to contribute' }).getAttribute('href')).toBe('/auth/login')
    expect(screen.queryByLabelText('Password')).toBeNull()
  })
})
