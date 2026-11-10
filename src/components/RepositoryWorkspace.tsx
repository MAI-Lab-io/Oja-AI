import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest, csrfHeaders } from '../lib/api'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog'
import { datasetMetadataForNewVersion, splitTemplate, type SplitMethod } from '../lib/datasetSplits'

type Kind = 'model' | 'dataset'
type Repo = { id: string; owner: string; kind: Kind; name: string; slug: string; description: string; visibility: string }
type UploadFile = { id: string; path: string; declared_size: number; size: number; sha256: string; status: string; scan_status: string; error: string; download_url: string | null }
type Release = { id: string; version: string; status: string; metadata: Record<string, any>; card: string; changelog: string; rights_confirmed: boolean; parent: string | null; sources: { source: string; relation: string }[]; files: UploadFile[]; manifest_sha256: string }
const root = '/api/v1'
const sizes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${(bytes / 1024 ** 2).toFixed(2)} MiB`
const template = (kind: Kind) => ({
  license: kind === 'model' ? 'Apache-2.0' : 'CC-BY-4.0', task: '', languages: [], tags: [], intended_use: '', limitations: '',
  ...(kind === 'model' ? { framework: 'pytorch', architecture: '', training_description: '' } : { modality: 'tabular', collection_method: '', contains_personal_data: 'unknown', splits: {}, features: [] }),
})

export function RepositoryWorkspace({ kind, publicOnly = false }: { kind: Kind; publicOnly?: boolean }) {
  const { user } = useAuth()
  const [repositories, setRepositories] = useState<Repo[]>([])
  const [repository, setRepository] = useState<Repo | null>(null)
  const [releases, setReleases] = useState<Release[]>([])
  const [release, setRelease] = useState<Release | null>(null)
  const [options, setOptions] = useState<any>(null)
  const [metadata, setMetadata] = useState<Record<string, any>>(template(kind))
  const [advanced, setAdvanced] = useState('{}')
  const [modelSchema, setModelSchema] = useState('')
  const [schemaEdited, setSchemaEdited] = useState(false)
  const [sources, setSources] = useState('[]')
  const [card, setCard] = useState('')
  const [changelog, setChangelog] = useState('')
  const [rights, setRights] = useState(false)
  const [version, setVersion] = useState('1.0.0')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [repositoryVisibility, setRepositoryVisibility] = useState('private')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')
  const [next, setNext] = useState<string | null>(null)
  const activeUpload = useRef<XMLHttpRequest | null>(null)
  const metadataControls = useRef<HTMLDivElement | null>(null)
  const selection = useRef<string | null>(null)
  const owns = repository?.owner === user?.username && !publicOnly
  const editable = owns && release?.status === 'draft'
  const mayContribute = !!user?.email_verified
  const pending = release?.files.some(item => ['uploaded', 'validating'].includes(item.status))

  useEffect(() => {
    if (!schemaEdited) setModelSchema(JSON.stringify(metadata, null, 2))
  }, [metadata, schemaEdited])

  const loadRepositories = useCallback(async () => {
    const data = await apiRequest(`${root}/repositories/?scope=${publicOnly ? 'public' : 'mine'}&kind=${kind}`)
    setRepositories(data.results || data)
    setNext(data.next || null)
  }, [kind, publicOnly])
  useEffect(() => {
    let active = true
    Promise.all([apiRequest(`${root}/upload-options/`), loadRepositories()])
      .then(([data]) => { if (active) setOptions(data) })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false; activeUpload.current?.abort() }
  }, [loadRepositories])

  const selectRelease = (value: Release) => {
    selection.current = value.id
    setRelease(value)
    setMetadata(value.metadata && Object.keys(value.metadata).length ? value.metadata : template(kind))
    setSchemaEdited(false)
    setAdvanced(JSON.stringify(kind === 'dataset' ? { splits: value.metadata.splits || {}, features: value.metadata.features || [] } : {}, null, 2))
    setSources(JSON.stringify(value.sources || [], null, 2))
    setCard(value.card); setChangelog(value.changelog); setRights(value.rights_confirmed)
    setError(''); setMessage('')
  }
  const selectRepository = async (value: Repo) => {
    selection.current = null
    setRepository(value); setRelease(null); setReleases([]); setError(''); setMessage('')
    setRepositoryVisibility(value.visibility)
    setCreating(false); setVersion('1.0.0')
    try {
      const data = await apiRequest(`${root}/repositories/${value.id}/releases/`)
      setReleases(data)
      if (data.length) selectRelease(data[0])
    } catch (error: any) { setError(error.message) }
  }
  const refreshRelease = async (id: string) => {
    const data = await apiRequest(`${root}/releases/${id}/`)
    if (selection.current === id) {
      setRelease(data)
      setReleases(previous => previous.map(item => item.id === id ? data : item))
    }
    return data as Release
  }
  useEffect(() => {
    if (!pending || !release) return
    const id = release.id
    const timer = window.setInterval(() => { void refreshRelease(id).catch(error => setError(error.message)) }, 3000)
    return () => window.clearInterval(timer)
  }, [pending, release?.id])

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('')
    try { await task() } catch (error: any) { setError(error.message || 'Request failed. Please try again.') }
    finally { setBusy(false); setProgress('') }
  }
  const createRepository = (event: React.FormEvent) => {
    event.preventDefault()
    void run(async () => {
      if (!name.trim() || !slug.trim() || !description.trim()) throw new Error('Name, repository slug, and description are required.')
      const value = await apiRequest(`${root}/repositories/`, { method: 'POST', body: JSON.stringify({ kind, name, slug, description, visibility }) })
      await loadRepositories(); await selectRepository(value)
      setMessage('Repository created. Create its first version below.')
    })
  }
  const createRelease = () => run(async () => {
    if (!repository) return
    const data = await apiRequest(`${root}/repositories/${repository.id}/releases/`, {
      method: 'POST', body: JSON.stringify({ version, ...(release?.status === 'published' ? { parent: release.id, metadata: kind === 'dataset' ? datasetMetadataForNewVersion(release.metadata, release.files) : release.metadata, card: release.card, sources: release.sources } : {}) }),
    })
    setReleases(previous => [data, ...previous]); selectRelease(data)
    setMessage('Draft created. Save its metadata and upload its files before publishing.')
  })
  const saveVisibility = () => run(async () => {
    if (!repository) return
    const updated = await apiRequest(`${root}/repositories/${repository.id}/`, { method: 'PATCH', body: JSON.stringify({ visibility: repositoryVisibility }) })
    setRepository(updated)
    setRepositoryVisibility(updated.visibility)
    setRepositories(previous => previous.map(item => item.id === updated.id ? updated : item))
    setMessage(updated.visibility === 'public' ? 'Repository is public. Published versions are available to everyone; drafts remain private.' : 'Repository is private. Only you can access its versions and files.')
  })
  const deleteRepository = async () => {
    if (!repository || deleteConfirmation !== `${repository.owner}/${repository.slug}` || busy) return
    setBusy(true); setDeleteError(''); setError(''); setMessage('')
    try {
      await apiRequest(`${root}/repositories/${repository.id}/`, { method: 'DELETE', body: JSON.stringify({ confirmation: deleteConfirmation }) })
      selection.current = null
      setRepositories(previous => previous.filter(item => item.id !== repository.id))
      setRepository(null); setRelease(null); setReleases([])
      setMetadata(template(kind)); setSchemaEdited(false)
      setDeleteOpen(false); setDeleteConfirmation('')
      setMessage('Repository deleted. File removal will finish in the background.')
    } catch (error: any) { setDeleteError(error.message || 'Unable to delete the repository. Please try again.') }
    finally { setBusy(false) }
  }
  const saveDraft = async () => {
    if (!release) return
    if (kind === 'model' && schemaEdited) throw new Error('Apply your model schema changes to the fields before saving metadata.')
    const controls = Array.from(metadataControls.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select') || [])
    for (const control of controls) {
      if (control.disabled) continue
      control.setCustomValidity(control.required && control.type !== 'checkbox' && !control.value.trim() ? 'This field is required.' : '')
      if (!control.checkValidity()) {
        let parent: HTMLElement | null = control.parentElement
        while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement }
        control.reportValidity(); control.focus()
        const label = control.labels?.[0]?.textContent || control.getAttribute('aria-label') || 'upload field'
        throw new Error(`Complete the required field: ${label}`)
      }
    }
    const extra = JSON.parse(advanced)
    if (!extra || Array.isArray(extra) || typeof extra !== 'object') throw new Error('Additional metadata must be a JSON object.')
    if (kind === 'dataset' && Object.keys(extra).some(key => !['splits', 'features'].includes(key))) throw new Error('Additional dataset metadata supports splits and features.')
    if (kind === 'dataset' && (!Object.hasOwn(extra, 'splits') || !Object.hasOwn(extra, 'features'))) throw new Error('Dataset schema must include splits and features. Use {} and [] when not applicable.')
    if (kind === 'model' && Object.keys(extra).length) throw new Error('Additional model metadata is not supported yet.')
    const sourceLinks = JSON.parse(sources)
    if (!Array.isArray(sourceLinks)) throw new Error('Exact upstream releases must be a JSON array. Use [] for an original upload.')
    const saved = await apiRequest(`${root}/releases/${release.id}/`, { method: 'PATCH', body: JSON.stringify({ metadata: { ...metadata, ...extra }, card, changelog, rights_confirmed: rights, sources: sourceLinks }) })
    if (kind === 'dataset') setAdvanced(JSON.stringify({ splits: saved.metadata.splits || {}, features: saved.metadata.features || [] }, null, 2))
    await refreshRelease(release.id)
  }
  const applyModelSchema = () => run(async () => {
    let value: any
    try { value = JSON.parse(modelSchema) } catch { throw new Error('Model schema must be valid JSON.') }
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Model schema must be a JSON object.')
    const allowed = ['license', 'license_url', 'task', 'languages', 'tags', 'intended_use', 'limitations', 'source_url', 'code_url', 'code_revision', 'methods', 'framework', 'architecture', 'training_description', 'parameter_count', 'citation']
    const unknown = Object.keys(value).filter(key => !allowed.includes(key))
    if (unknown.length) throw new Error(`Unsupported model schema fields: ${unknown.join(', ')}. Dataset splits and features do not belong in model metadata.`)
    const required = ['license', 'task', 'intended_use', 'limitations', 'framework', 'architecture', 'training_description']
    const missing = required.filter(key => typeof value[key] !== 'string' || !value[key].trim())
    if (missing.length) throw new Error(`Model schema is missing required text fields: ${missing.join(', ')}.`)
    setMetadata(value); setSchemaEdited(false)
    setMessage('Model schema applied to the fields. Save metadata to store it.')
  })
  const upload = async (files: FileList | null) => {
    if (!files || !release) return
    const items = Array.from(files)
    const id = release.id
    await run(async () => {
      for (const file of items) {
        if (!file.size) throw new Error(`${file.name} is empty.`)
        if (file.size > options.max_file_bytes) throw new Error(`${file.name} exceeds the ${sizes(options.max_file_bytes)} file limit.`)
        const path = file.webkitRelativePath || file.name
        const reservation = await apiRequest(`${root}/releases/${id}/files/`, { method: 'POST', body: JSON.stringify({ path, size: file.size }) })
        const headers = await csrfHeaders()
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          activeUpload.current = xhr
          xhr.open('PUT', reservation.upload_url)
          xhr.setRequestHeader('Content-Type', 'application/octet-stream')
          xhr.setRequestHeader('X-CSRFToken', headers['X-CSRFToken'])
          xhr.upload.onprogress = event => setProgress(`${path}: ${event.lengthComputable ? Math.round(event.loaded / event.total * 100) : 0}%`)
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else {
              let detail = `Upload failed (${xhr.status}). Remove this file before retrying.`
              try { detail = JSON.parse(xhr.responseText).detail || detail } catch { /* Non-JSON proxy errors. */ }
              reject(new Error(detail))
            }
          }
          xhr.onerror = () => reject(new Error('Upload connection failed. Remove the incomplete file and retry.'))
          xhr.onabort = () => reject(new Error('Upload cancelled. Remove the incomplete file before retrying.'))
          xhr.send(file)
        })
        activeUpload.current = null
        await refreshRelease(id)
      }
      setMessage('Files uploaded. Validation results will update below.')
    })
    await refreshRelease(id).catch(() => {})
  }
  const field = (key: string, label: string, multiline = false) => <div key={key} className="space-y-1">
    <Label htmlFor={`meta-${key}`}>{label}</Label>
    {multiline ? <Textarea id={`meta-${key}`} required={!label.includes('(optional)')} disabled={!editable || busy} value={metadata[key] || ''} onChange={event => setMetadata({ ...metadata, [key]: event.target.value })} /> :
      <Input id={`meta-${key}`} type={key.endsWith('_url') ? 'url' : 'text'} required={!label.includes('(optional)')} disabled={!editable || busy} value={metadata[key] || ''} onChange={event => setMetadata({ ...metadata, [key]: event.target.value })} />}
  </div>
  const splittingMethod = () => {
    try { return JSON.parse(advanced).splits?.method || 'legacy' } catch { return 'invalid' }
  }
  const chooseSplittingMethod = (method: string) => {
    try {
      const value = JSON.parse(advanced)
      setAdvanced(JSON.stringify({ ...value, splits: method === 'legacy' ? {} : splitTemplate(method as SplitMethod, release?.files || []) }, null, 2))
    } catch { setError('Correct the schema JSON before selecting a splitting method.') }
  }

  return <section className="repository-workspace space-y-5" aria-label={`${kind} repositories`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-semibold">{publicOnly ? 'Published' : 'My'} {kind === 'model' ? 'models' : 'datasets'}</h2><p className="text-sm text-gray-600">Versioned files, documentation, and provenance.</p></div>
      {!publicOnly && <Button disabled={!mayContribute || busy} onClick={() => setCreating(!creating)}>New {kind} repository</Button>}
    </div>
    {kind === 'model' && !release && <p className="text-sm text-gray-600">Create or select a model repository and a version to enter its model schema, model card, and files.</p>}
    {!publicOnly && !mayContribute && <p role="alert" className="text-amber-800">Verify your email before uploading or publishing.</p>}
    {error && <p role="alert" className="p-3 border rounded text-red-800 bg-red-50">{error}</p>}
    {message && <p role="status" className="p-3 border rounded text-green-800 bg-green-50">{message}</p>}
    {creating && <Card><CardHeader><CardTitle>Create a {kind} repository</CardTitle></CardHeader><CardContent>
      <form onSubmit={createRepository} className="repository-create-form">
        <div><Label htmlFor="repo-name">Name</Label><Input id="repo-name" required maxLength={150} value={name} onChange={event => { setName(event.target.value); setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '')) }} /></div>
        <div><Label htmlFor="repo-slug">Repository slug</Label><Input id="repo-slug" required pattern="[a-z0-9_-]+" maxLength={100} value={slug} onChange={event => setSlug(event.target.value)} /></div>
        <div><Label htmlFor="repo-description">Description</Label><Textarea id="repo-description" required maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} /></div>
        <div><Label htmlFor="repo-visibility">Visibility</Label><select required id="repo-visibility" className="block border rounded p-2" value={visibility} onChange={event => setVisibility(event.target.value)}><option value="private">Private</option><option value="public">Public after publication</option></select></div>
        <p className="text-xs text-gray-600">Drafts are visible only to you. You can change repository visibility later.</p>
        <Button disabled={busy} type="submit">Create repository</Button>
      </form>
    </CardContent></Card>}
    <div className="repository-grid grid gap-5 lg:grid-cols-3">
      <aside className="space-y-2">
        {!repositories.length && <p className="text-gray-600">{publicOnly ? 'No published repositories yet.' : 'Create your first repository to begin.'}</p>}
        {repositories.map(item => <button key={item.id} disabled={busy} onClick={() => void selectRepository(item)} className={`w-full text-left border rounded-lg p-4 ${repository?.id === item.id ? 'border-indigo-600 bg-indigo-50' : 'bg-white'}`}><strong className="block">{item.owner}/{item.slug}</strong><span className="text-sm text-gray-600">{item.name} · {item.visibility}</span></button>)}
        {next && <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
          const url = new URL(next, window.location.origin)
          const data = await apiRequest(url.pathname + url.search)
          setRepositories(previous => [...previous, ...data.results]); setNext(data.next)
        })}>Load more</Button>}
      </aside>
      <div className="space-y-5 lg:col-span-2">
        {repository && <Card><CardHeader><CardTitle>{repository.name}</CardTitle><p>{repository.description}</p></CardHeader><CardContent className="space-y-4">
          {owns && <div className="space-y-3 border rounded-lg p-4">
            <Label htmlFor="repository-access">Repository visibility</Label>
            <div className="page-actions"><select required id="repository-access" disabled={busy || !mayContribute} value={repositoryVisibility} onChange={event => setRepositoryVisibility(event.target.value)}><option value="private">Private</option><option value="public">Public</option></select><Button variant="outline" disabled={busy || !mayContribute || repositoryVisibility === repository.visibility} onClick={() => void saveVisibility()}>Save visibility</Button></div>
            <p className="text-sm text-gray-600">Applies to all versions and files in this repository. Public shows published versions in the zoo; drafts stay private. Private restricts access to you.</p>
          </div>}
          <div className="flex flex-wrap gap-2">{releases.map(item => <Button key={item.id} disabled={busy} variant={item.id === release?.id ? 'default' : 'outline'} onClick={() => selectRelease(item)}>{item.version} · {item.status}</Button>)}</div>
          {owns && <div className="flex flex-wrap gap-2"><Input required aria-label="New version label" className="max-w-48" value={version} onChange={event => setVersion(event.target.value)} /><Button disabled={busy || !mayContribute || !version.trim()} onClick={() => void createRelease()}>Create new version</Button></div>}
          {release && <p className="text-xs break-all text-gray-600">Release ID: {release.id}{release.parent ? ` · Parent: ${release.parent}` : ''}</p>}
          {owns && <div className="border-t pt-4"><AlertDialog open={deleteOpen} onOpenChange={open => { if (!busy) setDeleteOpen(open) }}>
            <AlertDialogTrigger asChild><Button variant="destructive" disabled={busy || !mayContribute} onClick={() => { setDeleteConfirmation(''); setDeleteError('') }}>Delete repository</Button></AlertDialogTrigger>
            <AlertDialogContent className="repository-delete-dialog">
              <AlertDialogHeader><AlertDialogTitle>Delete repository?</AlertDialogTitle><AlertDialogDescription>This permanently deletes {repository.owner}/{repository.slug}, including all versions, metadata, and uploaded files. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
              <div className="space-y-3"><Label htmlFor="delete-repository-confirmation">Type {repository.owner}/{repository.slug} to confirm</Label><Input id="delete-repository-confirmation" autoComplete="off" disabled={busy} value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} /></div>
              {deleteError && <p role="alert" className="text-sm text-red-800">{deleteError}</p>}
              <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction asChild><Button variant="destructive" disabled={busy || deleteConfirmation !== `${repository.owner}/${repository.slug}`} onClick={event => { event.preventDefault(); void deleteRepository() }}>{busy ? 'Deleting...' : 'Permanently delete repository'}</Button></AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog></div>}
        </CardContent></Card>}
        {release && <Card><CardHeader><CardTitle>{release.version} — {release.status}</CardTitle></CardHeader><CardContent className="space-y-5">
          <div ref={metadataControls} className="space-y-5">
          <p className="text-sm text-gray-600">All fields are required unless labeled optional. Files are required before publication.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="meta-license">License</Label><select required id="meta-license" className="block w-full border rounded p-2" disabled={!editable || busy} value={metadata.license} onChange={event => setMetadata({ ...metadata, license: event.target.value })}>{options?.licenses.map((value: string) => <option key={value}>{value}</option>)}</select></div>
            {field('task', 'Task')}
            {metadata.license === 'LicenseRef-Custom' && field('license_url', 'Custom license URL')}
            {kind === 'model' ? <><div><Label htmlFor="meta-framework">Framework</Label><select required id="meta-framework" className="block w-full border rounded p-2" disabled={!editable || busy} value={metadata.framework} onChange={event => setMetadata({ ...metadata, framework: event.target.value })}>{['pytorch', 'tensorflow', 'onnx', 'jax', 'other'].map(value => <option key={value}>{value}</option>)}</select></div>{field('architecture', 'Architecture')}</> : <>
              <div><Label htmlFor="meta-modality">Modality</Label><select required id="meta-modality" className="block w-full border rounded p-2" disabled={!editable || busy} value={metadata.modality} onChange={event => setMetadata({ ...metadata, modality: event.target.value })}>{['tabular', 'text', 'image', 'medical', 'multimodal'].map(value => <option key={value}>{value}</option>)}</select></div>
              <div><Label htmlFor="meta-personal">Contains personal data?</Label><select required id="meta-personal" className="block w-full border rounded p-2" disabled={!editable || busy} value={metadata.contains_personal_data} onChange={event => setMetadata({ ...metadata, contains_personal_data: event.target.value })}>{['unknown', 'no', 'yes'].map(value => <option key={value}>{value}</option>)}</select></div>
            </>}
          </div>
          {kind === 'model' && <div><Label htmlFor="model-parameters">Parameter count (optional)</Label><Input id="model-parameters" type="number" min={0} step={1} disabled={!editable || busy} value={metadata.parameter_count ?? ''} onChange={event => {
            const next = { ...metadata }
            if (event.target.value === '') delete next.parameter_count
            else next.parameter_count = Number(event.target.value)
            setMetadata(next)
          }} /></div>}
          {field('intended_use', 'Intended use', true)}{field('limitations', 'Limitations and known biases', true)}
          {kind === 'model' ? field('training_description', 'Training description', true) : field('collection_method', 'Data collection method', true)}
          <div className="grid gap-3 sm:grid-cols-2">{field('source_url', 'Original source URL (optional)')}{field('code_url', 'Code repository URL (optional)')}{field('code_revision', 'Code commit/revision (optional)')}</div>
          {field('methods', 'Processing and provenance notes (optional)', true)}
          {field('citation', 'Citation (optional)', true)}
          {kind === 'model' && <section className="space-y-3 border rounded-lg p-4" aria-label="Model schema">
            <h3 className="font-semibold">Model schema</h3>
            <p className="text-sm text-gray-600">Enter model metadata using the fields above, or paste the complete metadata object from schema/model_schema_example.json below. This describes the model; upload weights and configuration files separately.</p>
            <Label htmlFor="model-schema-json">Model schema (JSON)</Label>
            <Textarea required id="model-schema-json" rows={12} spellCheck={false} disabled={!editable || busy} value={modelSchema} onChange={event => { setModelSchema(event.target.value); setSchemaEdited(true) }} />
            <p className="text-xs text-gray-600">Required: license, task, intended_use, limitations, framework, architecture, training_description. Dataset splits and features are not accepted. Django validates the metadata when you save.</p>
            {editable && <div className="page-actions"><Button variant="outline" disabled={busy || !schemaEdited} onClick={() => void applyModelSchema()}>Apply schema to fields</Button><Button variant="ghost" disabled={busy || !schemaEdited} onClick={() => setSchemaEdited(false)}>Reset JSON to fields</Button></div>}
            {schemaEdited && <p role="status" className="text-sm text-amber-800">You have unapplied schema edits. Applying the JSON replaces the metadata fields above; then use Save metadata.</p>}
          </section>}
          <div><Label htmlFor="release-card">{kind === 'model' ? 'Model' : 'Dataset'} card (Markdown)</Label><Textarea required id="release-card" rows={7} disabled={!editable || busy} value={card} onChange={event => setCard(event.target.value)} placeholder="Describe the artifact, intended use, source, methodology, evaluation, limitations, and citation." /></div>
          <div><Label htmlFor="release-changes">Changelog</Label><Textarea required id="release-changes" disabled={!editable || busy} value={changelog} onChange={event => setChangelog(event.target.value)} /></div>
          <details><summary className="cursor-pointer font-medium">{kind === 'model' ? 'Model provenance and training data' : 'Dataset provenance and schema'}</summary><div className="space-y-3 pt-3">
            <Label htmlFor="release-sources">Exact upstream releases (JSON)</Label><Textarea required id="release-sources" rows={4} disabled={!editable || busy} value={sources} onChange={event => setSources(event.target.value)} /><p className="text-xs text-gray-600">Example: [{'{'}"source": "published-release-uuid", "relation": "{kind === 'model' ? 'trained_on' : 'derived_from'}"{'}'}]</p>
            <p className="text-sm text-gray-600">{kind === 'model' ? 'Use trained_on for a published training dataset release, or derived_from for a published base model release. Enter [] when there are no upstream platform releases; describe external training data in the model card.' : 'Use derived_from for an accessible published upstream release. Enter [] for an original dataset.'}</p>
            {kind === 'dataset' && <>
              <Label htmlFor="dataset-splitting-method">Dataset splitting method</Label>
              <select id="dataset-splitting-method" required disabled={!editable || busy} value={splittingMethod()} onChange={event => chooseSplittingMethod(event.target.value)}>
                <option value="legacy">Existing example counts / unspecified</option><option value="separate_files">Separate partition files</option><option value="column">One file with a split column</option><option value="user_defined">One file; configure percentages later</option>{splittingMethod() === 'invalid' && <option value="invalid">Correct the schema JSON</option>}
              </select>
              <p className="text-sm text-gray-600">Select a method to insert its configuration while keeping your features. Upload partition/data files first for predefined splits. References resolve to artifact IDs within this version when saved.</p>
              <p className="text-sm text-gray-600">See schema/README.md and the dataset JSON examples in schema/ for complete guidance.</p>
              <Label htmlFor="release-schema">Splits and features (JSON)</Label><Textarea required id="release-schema" rows={12} disabled={!editable || busy} value={advanced} onChange={event => setAdvanced(event.target.value)} />
              <p className="text-xs text-gray-600">Predefined splits need no percentages. For user_defined, ratios may be null until configured, or contain positive train/test percentages totaling 100; validation is optional (for example 80/20). Existing numeric splits remain declared example counts. Use {'{"splits":{},"features":[]}'} when neither applies.</p>
            </>}
          </div></details>
          {owns && <label className="flex gap-2 items-start"><input type="checkbox" required disabled={!editable || busy} checked={rights} onChange={event => setRights(event.target.checked)} />I have the rights to upload these files under the selected license and have reviewed them for sensitive information.</label>}
          {editable && <div className="page-actions"><Button disabled={busy || !mayContribute || (kind === 'model' && schemaEdited)} onClick={() => void run(async () => { await saveDraft(); setMessage('Draft metadata saved.') })}>Save metadata</Button><Button variant="outline" disabled={busy || (kind === 'model' && schemaEdited) || !rights || !release.files.length || release.files.some(item => item.status !== 'ready')} onClick={() => void run(async () => {
            await saveDraft(); await apiRequest(`${root}/releases/${release.id}/publish/`, { method: 'POST', body: '{}' }); await refreshRelease(release.id); setMessage('Release published. Its files and metadata are now fixed.')
          })}>Publish version</Button></div>}
          </div>
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold">Files</h3>
            {editable && <>
              <Label htmlFor="artifact-files">Choose one or more files</Label><Input id="artifact-files" required={!release.files.length} type="file" multiple disabled={busy || !mayContribute || !options} accept={options?.extensions[kind].join(',')} onChange={event => { void upload(event.target.files); event.target.value = '' }} />
              <p className="text-xs text-gray-600">Maximum {options ? sizes(options.max_file_bytes) : '…'} per file. Configuration and documentation can accompany model weights. Files are never executed.</p>
              {options?.scan_mode === 'development' && <p className="text-sm text-amber-800">Local development: integrity and format checks run, but malware scanning is not configured.</p>}
            </>}
            {progress && <p role="status">{progress} <Button variant="ghost" onClick={() => activeUpload.current?.abort()}>Cancel upload</Button></p>}
            {pending && <p role="status" className="text-sm">Files are awaiting validation. Their status updates automatically.</p>}
            {release.files.map(item => <div key={item.id} className="border rounded p-3 space-y-1">
              <div className="flex flex-wrap justify-between gap-2"><strong className="break-all">{item.path}</strong><span>{item.status} · {sizes(item.size || item.declared_size)}</span></div>
              {item.sha256 && <p className="text-xs break-all">SHA-256: {item.sha256}</p>}
              {kind === 'dataset' && <p className="text-xs break-all">Artifact ID: {item.id}</p>}
              {item.scan_status === 'not_scanned' && <p className="text-xs text-amber-800">Not malware scanned</p>}
              {item.scan_status === 'clean' && <p className="text-xs text-green-800">Malware scan passed</p>}
              {item.error && <p className="text-sm text-red-800">{item.error}</p>}
              <div className="flex gap-3">{item.download_url && <a className="underline text-sm" href={item.download_url}>Download</a>}
                {editable && <Button variant="ghost" size="sm" disabled={busy || ['receiving', 'validating'].includes(item.status)} onClick={() => void run(async () => { await apiRequest(`${root}/artifacts/${item.id}/`, { method: 'DELETE' }); await refreshRelease(release.id) })}>Remove from draft</Button>}
              </div>
            </div>)}
            {release.status === 'published' && <div className="space-y-1"><a className="underline" href={`${root}/releases/${release.id}/manifest/`} target="_blank" rel="noreferrer">View immutable release manifest</a><p className="text-xs break-all">Manifest SHA-256: {release.manifest_sha256}</p></div>}
          </div>
        </CardContent></Card>}
      </div>
    </div>
  </section>
}
