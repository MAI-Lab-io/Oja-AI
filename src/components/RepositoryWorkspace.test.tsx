import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepositoryWorkspace } from './RepositoryWorkspace'
import { apiRequest, csrfHeaders } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import modelSchemaExample from '../../schema/model_schema_example.json'

vi.mock('../lib/api', () => ({ apiRequest: vi.fn(), csrfHeaders: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))

const repository = { id: 'repo-1', owner: 'alice', kind: 'dataset', name: 'Speech examples', slug: 'speech', visibility: 'private', description: 'A test dataset' }
let release: any
let requests: { method: string; url: string; headers: Record<string, string>; body: File }[]

class UploadRequest {
  method = ''; url = ''; headers: Record<string, string> = {}; status = 202; responseText = '{}'
  upload: any = {}; onload: any; onerror: any; onabort: any
  open(method: string, url: string) { this.method = method; this.url = url }
  setRequestHeader(key: string, value: string) { this.headers[key] = value }
  send(body: File) {
    requests.push({ method: this.method, url: this.url, headers: this.headers, body })
    release.files = [{ id: 'file-1', path: body.name, declared_size: body.size, size: 0, sha256: '', status: 'uploaded', scan_status: 'pending', error: '', download_url: null }]
    queueMicrotask(() => this.onload())
  }
  abort() { this.onabort?.() }
}

beforeEach(() => {
  requests = []
  release = { id: 'release-1', version: '1.0.0', status: 'draft', metadata: { license: 'CC-BY-4.0', task: 'classification', intended_use: 'Research', limitations: 'Small sample', modality: 'tabular', collection_method: 'Synthetic', contains_personal_data: 'no' }, card: '# Dataset card', changelog: 'Initial release', rights_confirmed: true, parent: null, sources: [], files: [], manifest_sha256: '' }
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1', username: 'alice', email_verified: true } } as any)
  vi.mocked(csrfHeaders).mockResolvedValue({ 'X-CSRFToken': 'test-csrf' })
  vi.mocked(apiRequest).mockImplementation(async (url, options) => {
    const path = String(url)
    if (path.endsWith('/upload-options/')) return { max_file_bytes: 1024, licenses: ['CC-BY-4.0', 'Apache-2.0'], extensions: { dataset: ['.csv'], model: ['.onnx', '.safetensors'] }, scan_mode: 'development' }
    if (path.includes('/repositories/?')) return { results: [repository], next: null }
    if (path === '/api/v1/repositories/repo-1/' && options?.method === 'PATCH') return { ...repository, ...JSON.parse(options.body as string) }
    if (path === '/api/v1/repositories/repo-1/' && options?.method === 'DELETE') return null
    if (path === '/api/v1/repositories/repo-1/releases/') return [structuredClone(release)]
    if (path === '/api/v1/releases/release-1/' && options?.method === 'PATCH') {
      release = { ...release, ...JSON.parse(options.body as string) }
      return structuredClone(release)
    }
    if (path === '/api/v1/releases/release-1/files/') return { file: { id: 'file-1' }, upload_url: '/api/v1/artifacts/file-1/content/', method: 'PUT' }
    if (path === '/api/v1/releases/release-1/publish/') { release.status = 'published'; release.manifest_sha256 = 'abc'; return { status: 'published' } }
    if (path === '/api/v1/releases/release-1/') return structuredClone(release)
    throw new Error(`Unexpected test request: ${path}`)
  })
  vi.stubGlobal('XMLHttpRequest', UploadRequest)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('Repository upload workspace', () => {
  const openModel = async (status = 'draft') => {
    release.metadata = { ...modelSchemaExample }
    release.status = status
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation((url, options) => String(url).includes('/repositories/?')
      ? Promise.resolve({ results: [{ ...repository, kind: 'model' }], next: null }) : original(url, options))
    render(<RepositoryWorkspace kind="model" />)
    await userEvent.click(await screen.findByRole('button', { name: /alice\/speech/ }))
  }

  it.each(['model', 'dataset'] as const)('saves an optional contributor citation for a %s without generating one', async kind => {
    const user = userEvent.setup()
    if (kind === 'model') await openModel()
    else {
      render(<RepositoryWorkspace kind="dataset" />)
      await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    }
    const citation = screen.getByLabelText('Citation (optional)')
    expect(citation).toHaveProperty('required', false)
    expect(citation).toHaveProperty('value', '')
    fireEvent.change(citation, { target: { value: 'Contributor citation for this resource.' } })
    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText('Draft metadata saved.')
    expect(release.metadata.citation).toBe('Contributor citation for this resource.')
  })

  it('inserts separate-file configuration using attached artifact IDs and preserves features', async () => {
    const user = userEvent.setup()
    release.metadata.features = [{ name: 'age', dtype: 'integer' }]
    release.files = [{ id: 'train-id', path: 'train.csv', status: 'ready' }, { id: 'test-id', path: 'test.csv', status: 'ready' }]
    render(<RepositoryWorkspace kind="dataset" />)
    await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    await user.selectOptions(screen.getByLabelText('Dataset splitting method'), 'separate_files')
    const schema = JSON.parse((screen.getByLabelText('Splits and features (JSON)') as HTMLTextAreaElement).value)
    expect(schema.splits).toEqual({ status: 'predefined', method: 'separate_files', files: { train: 'train-id', test: 'test-id' }, ratios: null })
    expect(schema.features).toEqual([{ name: 'age', dtype: 'integer' }])
    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText('Draft metadata saved.')
    const patch = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === 'PATCH')!
    expect(JSON.parse(patch[1]!.body as string).metadata.splits).toEqual(schema.splits)
  })

  it('supports deferred user-defined splitting and later 80/20 percentages', async () => {
    const user = userEvent.setup()
    render(<RepositoryWorkspace kind="dataset" />)
    await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    await user.selectOptions(screen.getByLabelText('Dataset splitting method'), 'user_defined')
    const editor = screen.getByLabelText('Splits and features (JSON)') as HTMLTextAreaElement
    const schema = JSON.parse(editor.value)
    expect(schema.splits.ratios).toBeNull()
    schema.splits.ratios = { train: 80, test: 20 }
    fireEvent.change(editor, { target: { value: JSON.stringify(schema) } })
    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText('Draft metadata saved.')
    const patch = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === 'PATCH')!
    expect(JSON.parse(patch[1]!.body as string).metadata.splits.ratios).toEqual({ train: 80, test: 20 })
  })

  it.each(['model', 'dataset'] as const)('requires all unlabeled-optional %s fields and blocks whitespace-only values', async kind => {
    const user = userEvent.setup()
    if (kind === 'model') await openModel()
    else {
      render(<RepositoryWorkspace kind="dataset" />)
      await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    }
    const labels = ['License', 'Task', 'Intended use', 'Limitations and known biases', `${kind === 'model' ? 'Model' : 'Dataset'} card (Markdown)`, 'Changelog', 'Exact upstream releases (JSON)', ...(kind === 'model' ? ['Framework', 'Architecture', 'Training description', 'Model schema (JSON)'] : ['Modality', 'Contains personal data?', 'Data collection method', 'Splits and features (JSON)'])]
    for (const label of labels) expect(screen.getByLabelText(label)).toHaveProperty('required', true)
    for (const label of ['Original source URL (optional)', 'Code repository URL (optional)', 'Code commit/revision (optional)', 'Processing and provenance notes (optional)', ...(kind === 'model' ? ['Parameter count (optional)'] : [])]) expect(screen.getByLabelText(label)).toHaveProperty('required', false)
    expect(screen.getByRole('checkbox', { name: /I have the rights/ })).toHaveProperty('required', true)
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: '   ' } })
    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Task')
    expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false)
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'classification' } })
    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText('Draft metadata saved.')
  })

  it('requires upstream JSON and a dataset schema declaration, revealing hidden invalid fields', async () => {
    const user = userEvent.setup()
    render(<RepositoryWorkspace kind="dataset" />)
    await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    const sources = screen.getByLabelText('Exact upstream releases (JSON)')
    fireEvent.change(sources, { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Exact upstream releases')
    expect(sources.closest('details')).toHaveProperty('open', true)
    fireEvent.change(sources, { target: { value: '[]' } })
    fireEvent.change(screen.getByLabelText('Splits and features (JSON)'), { target: { value: '{}' } })
    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    expect((await screen.findByRole('alert')).textContent).toContain('must include splits and features')
    expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false)
  })

  it.each(['model', 'dataset'] as const)('requires a description when creating a %s repository', async kind => {
    const user = userEvent.setup()
    render(<RepositoryWorkspace kind={kind} />)
    await user.click(await screen.findByRole('button', { name: `New ${kind} repository` }))
    for (const label of ['Name', 'Repository slug', 'Description', 'Visibility']) expect(screen.getByLabelText(label)).toHaveProperty('required', true)
    await user.type(screen.getByLabelText('Name'), 'New repository')
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '   ' } })
    await user.click(screen.getByRole('button', { name: 'Create repository' }))
    expect((await screen.findByRole('alert')).textContent).toContain('description are required')
    expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })

  it.each(['model', 'dataset'] as const)('deletes a %s repository only after exact confirmation and allows cancellation', async kind => {
    const user = userEvent.setup()
    if (kind === 'model') await openModel('published')
    else {
      render(<RepositoryWorkspace kind="dataset" />)
      await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    }
    await user.click(screen.getByRole('button', { name: 'Delete repository', exact: true }))
    let dialog = screen.getByRole('alertdialog', { name: 'Delete repository?' })
    const confirmation = within(dialog).getByLabelText('Type alice/speech to confirm')
    expect(within(dialog).getByRole('button', { name: 'Permanently delete repository' })).toHaveProperty('disabled', true)
    fireEvent.change(confirmation, { target: { value: 'speech' } })
    expect(within(dialog).getByRole('button', { name: 'Permanently delete repository' })).toHaveProperty('disabled', true)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: /alice\/speech/ })).toBeTruthy()
    expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Delete repository', exact: true }))
    dialog = screen.getByRole('alertdialog', { name: 'Delete repository?' })
    fireEvent.change(within(dialog).getByLabelText('Type alice/speech to confirm'), { target: { value: 'alice/speech' } })
    await user.click(within(dialog).getByRole('button', { name: 'Permanently delete repository' }))
    await screen.findByText('Repository deleted. File removal will finish in the background.')
    expect(screen.queryByRole('button', { name: /alice\/speech/ })).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete repository', exact: true })).toBeNull()
    const deleted = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === 'DELETE')!
    expect(deleted[0]).toBe('/api/v1/repositories/repo-1/')
    expect(JSON.parse(deleted[1]!.body as string)).toEqual({ confirmation: 'alice/speech' })
  })

  it('keeps the confirmation dialog open when provenance protection blocks deletion', async () => {
    const user = userEvent.setup()
    render(<RepositoryWorkspace kind="dataset" />)
    await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    await user.click(screen.getByRole('button', { name: 'Delete repository', exact: true }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete repository?' })
    fireEvent.change(within(dialog).getByLabelText('Type alice/speech to confirm'), { target: { value: 'alice/speech' } })
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Another repository references this release.'))
    await user.click(within(dialog).getByRole('button', { name: 'Permanently delete repository' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Another repository references')
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.queryByText('Repository deleted. File removal will finish in the background.')).toBeNull()
  })

  it.each(['model', 'dataset'] as const)('changes %s repository visibility in both directions without changing metadata', async kind => {
    const user = userEvent.setup()
    if (kind === 'model') await openModel('published')
    else {
      render(<RepositoryWorkspace kind="dataset" />)
      await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    }
    const metadataBefore = structuredClone(release.metadata)
    await user.selectOptions(screen.getByLabelText('Repository visibility'), 'public')
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    await screen.findByText('Repository is public. Published versions are available to everyone; drafts remain private.')
    expect(screen.getByRole('button', { name: /alice\/speech/ }).textContent).toContain('public')
    expect(screen.getByRole('button', { name: 'Save visibility' })).toHaveProperty('disabled', true)
    await user.selectOptions(screen.getByLabelText('Repository visibility'), 'private')
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    await screen.findByText('Repository is private. Only you can access its versions and files.')
    expect(release.metadata).toEqual(metadataBefore)
    const patches = vi.mocked(apiRequest).mock.calls.filter(([, options]) => options?.method === 'PATCH')
    expect(patches.map(([path, options]) => [path, JSON.parse(options!.body as string)])).toEqual([
      ['/api/v1/repositories/repo-1/', { visibility: 'public' }],
      ['/api/v1/repositories/repo-1/', { visibility: 'private' }],
    ])
  })

  it('retains the saved visibility and surfaces a rejected public-visibility change', async () => {
    const user = userEvent.setup()
    render(<RepositoryWorkspace kind="dataset" />)
    await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Public datasets must be declared free of personal data.'))
    await user.selectOptions(screen.getByLabelText('Repository visibility'), 'public')
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    expect((await screen.findByRole('alert')).textContent).toContain('personal data')
    expect(screen.getByRole('button', { name: /alice\/speech/ }).textContent).toContain('private')
    expect(screen.queryByText('Repository is public. Published versions are available to everyone; drafts remain private.')).toBeNull()
  })

  it('applies the model JSON example to fields and saves it as release metadata', async () => {
    await openModel()
    const schema = { ...modelSchemaExample, architecture: 'Updated architecture', parameter_count: 54321, tags: ['tabular', 'churn'], languages: ['en'] }
    fireEvent.change(screen.getByLabelText('Model schema (JSON)'), { target: { value: JSON.stringify(schema) } })
    expect(screen.getByRole('button', { name: 'Save metadata' })).toHaveProperty('disabled', true)
    await userEvent.click(screen.getByRole('button', { name: 'Apply schema to fields' }))
    expect(screen.getByLabelText('Architecture')).toHaveProperty('value', 'Updated architecture')
    expect(screen.getByLabelText('Parameter count (optional)')).toHaveProperty('value', '54321')
    expect(apiRequest).not.toHaveBeenCalledWith('/api/v1/releases/release-1/', expect.objectContaining({ method: 'PATCH' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText('Draft metadata saved.')
    const patch = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === 'PATCH')!
    expect(JSON.parse(patch[1]!.body as string).metadata).toEqual(schema)
  })

  it('rejects malformed and dataset-only JSON without changing model fields', async () => {
    await openModel()
    const schema = screen.getByLabelText('Model schema (JSON)')
    fireEvent.change(schema, { target: { value: '{broken' } })
    await userEvent.click(screen.getByRole('button', { name: 'Apply schema to fields' }))
    await screen.findByText('Model schema must be valid JSON.')
    fireEvent.change(schema, { target: { value: JSON.stringify({ ...modelSchemaExample, splits: { train: 10 } }) } })
    await userEvent.click(screen.getByRole('button', { name: 'Apply schema to fields' }))
    await screen.findByText(/Unsupported model schema fields: splits/)
    expect(screen.getByLabelText('Architecture')).toHaveProperty('value', modelSchemaExample.architecture)
    await userEvent.click(screen.getByRole('button', { name: 'Reset JSON to fields' }))
    expect(JSON.parse((schema as HTMLTextAreaElement).value)).toEqual(modelSchemaExample)
    expect(screen.getByRole('button', { name: 'Save metadata' })).toHaveProperty('disabled', false)
  })

  it('shows the schema read-only for a published model', async () => {
    await openModel('published')
    expect(screen.getByLabelText('Model schema (JSON)')).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Apply schema to fields' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save metadata' })).toBeNull()
  })

  it('saves model-specific metadata without exposing dataset splits or features', async () => {
    release.metadata = { license: 'Apache-2.0', task: 'classification', intended_use: 'Research', limitations: 'Small sample', framework: 'pytorch', architecture: 'MLP', training_description: 'Synthetic training data' }
    const original = vi.mocked(apiRequest).getMockImplementation()!
    vi.mocked(apiRequest).mockImplementation((url, options) => String(url).includes('/repositories/?')
      ? Promise.resolve({ results: [{ ...repository, kind: 'model' }], next: null })
      : original(url, options))
    const user = userEvent.setup()
    render(<RepositoryWorkspace kind="model" />)
    await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    expect(screen.getByLabelText('Architecture')).toBeTruthy()
    expect(screen.getByLabelText('Training description')).toBeTruthy()
    expect(screen.queryByLabelText('Data collection method')).toBeNull()
    expect(screen.queryByLabelText('Splits and features (JSON)')).toBeNull()
    expect(screen.getByText('Model provenance and training data')).toBeTruthy()
    await user.type(screen.getByLabelText('Parameter count (optional)'), '123')
    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    await screen.findByText('Draft metadata saved.')
    const call = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === 'PATCH')!
    const metadata = JSON.parse(call[1]!.body as string).metadata
    expect(metadata.parameter_count).toBe(123)
    expect(metadata.framework).toBe('pytorch')
    expect(metadata.splits).toBeUndefined()
    expect(metadata.features).toBeUndefined()
  })
  it('reserves and streams a selected file with CSRF, then waits for validation before publishing', async () => {
    const user = userEvent.setup()
    render(<RepositoryWorkspace kind="dataset" />)
    await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    const file = new File(['text,label\nhello,1\n'], 'data.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText('Choose one or more files'), file)
    await screen.findByText('Files uploaded. Validation results will update below.')
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ method: 'PUT', url: '/api/v1/artifacts/file-1/content/', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRFToken': 'test-csrf' }, body: file })
    const reservation = vi.mocked(apiRequest).mock.calls.find(([path]) => String(path).endsWith('/files/'))!
    expect(JSON.parse(reservation[1]!.body as string)).toEqual({ path: 'data.csv', size: file.size })
    expect((screen.getByRole('button', { name: 'Publish version' }) as HTMLButtonElement).disabled).toBe(true)
    release.files[0] = { ...release.files[0], status: 'ready', scan_status: 'not_scanned', size: file.size, sha256: '123', download_url: '/api/v1/artifacts/file-1/download/' }
    await waitFor(() => expect((screen.getByRole('button', { name: 'Publish version' }) as HTMLButtonElement).disabled).toBe(false), { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: 'Publish version' }))
    await screen.findByText('Release published. Its files and metadata are now fixed.')
    expect(screen.queryByRole('button', { name: 'Save metadata' })).toBeNull()
    expect(screen.getByRole('link', { name: 'View immutable release manifest' })).toBeTruthy()
  })

  it('blocks new uploads for an unverified account', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { username: 'alice', email_verified: false } } as any)
    render(<RepositoryWorkspace kind="dataset" />)
    await screen.findByText('Verify your email before uploading or publishing.')
    expect((screen.getByRole('button', { name: 'New dataset repository' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not offer editing or uploads in the public library', async () => {
    const user = userEvent.setup()
    release.status = 'published'
    render(<RepositoryWorkspace kind="dataset" publicOnly />)
    await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    expect(screen.queryByLabelText('Choose one or more files')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save metadata' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New dataset repository' })).toBeNull()
    expect(screen.queryByLabelText('Repository visibility')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete repository' })).toBeNull()
  })

  it('shows metadata validation errors without claiming a successful save', async () => {
    const user = userEvent.setup()
    render(<RepositoryWorkspace kind="dataset" />)
    await user.click(await screen.findByRole('button', { name: /alice\/speech/ }))
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('metadata: license is required'))
    await user.click(screen.getByRole('button', { name: 'Save metadata' }))
    expect((await screen.findByRole('alert')).textContent).toContain('license is required')
    expect(screen.queryByText('Draft metadata saved.')).toBeNull()
  })
})
