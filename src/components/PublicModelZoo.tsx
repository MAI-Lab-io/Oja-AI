import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../lib/api'
import { Button } from './ui/button'
import { DownloadLink } from './DownloadLink'
import { Badge } from './ui/badge'
import { Download } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { formatArtifactSize as formatSize } from '../lib/catalogFormat'
import { ModelZoo, type Model as CatalogModel } from './ModelZoo'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { MarkdownCard } from './MarkdownCard'
import { useCatalogDetail, usePublishedVersions } from '../lib/catalogDetail'

type Model = {
  id: string; name: string; slug: string; owner: string; description: string
  download_count?: number
  latest_release: null | { id: string; version: string; metadata: Record<string, any>; published_at: string; file_count: number; total_size: number }
}


function ModelVersions({ model, onBack, releaseId, version, onReleaseChange, section, onSectionChange }: { model: Model; onBack: () => void; releaseId: string; version: string; onReleaseChange: (id: string, replace?: boolean, version?: string) => void; section: string; onSectionChange: (value: string) => void }) {
  const { releases, selectedId: selected, release, error, loading } = usePublishedVersions<any>(model.id, model.latest_release?.id, releaseId, onReleaseChange, version)
  const activeSection = ['overview', 'schema', 'files', 'provenance'].includes(section) ? section : 'overview'
  return <section className="data-zoo-detail space-y-5" aria-label="Model versions">
    <Button variant="outline" onClick={onBack}>Back to model list</Button>
    <Card className="catalog-release-header"><CardHeader><p className="catalog-eyebrow">Model repository</p><CardTitle className="catalog-release-title">{model.name}</CardTitle><p className="text-sm text-gray-600">{model.owner}/{model.slug}</p><p className="data-zoo-description">{model.description}</p></CardHeader><CardContent className="space-y-5">
      {loading && <p role="status">Loading published versions...</p>}{error && <p role="alert">{error}</p>}
      {!loading && !error && !releases.length && <p>No published versions are available.</p>}
      {!!releases.length && <div className="catalog-release-toolbar"><div><label htmlFor="public-model-version" className="block text-sm font-medium mb-2">Version</label><select id="public-model-version" value={selected} onChange={event => onReleaseChange(event.target.value, false, releases.find(value => value.id === event.target.value)?.version)}>{!releases.some(value => value.id === selected) && <option value={selected} disabled>Requested version unavailable</option>}{releases.map(value => <option key={value.id} value={value.id}>{value.version}</option>)}</select></div>
        {release && <><Badge variant="secondary">Published</Badge><span className="text-sm text-gray-600">{release.published_at ? new Date(release.published_at).toLocaleDateString() : 'Date not specified'}</span><Button asChild><DownloadLink filename={`${model.slug}-${release.version}.zip`} href={`/api/v1/releases/${release.id}/download/`}><Download size={16} aria-hidden="true" />Download Model <span title="Completed downloads">({(model.download_count || 0).toLocaleString()})</span></DownloadLink></Button></>}
      </div>}
      {release && <dl className="data-zoo-facts catalog-release-facts">{[['Task', release.metadata.task], ['Framework', release.metadata.framework], ['License', release.metadata.license], ['Files', String(release.files.filter((file: any) => file.status === 'ready').length)]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not specified'}</dd></div>)}</dl>}
    </CardContent></Card>
    {release && <Tabs value={activeSection} onValueChange={onSectionChange} className="platform-tabs catalog-detail-tabs"><TabsList aria-label="Model details"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="schema">Schema</TabsTrigger><TabsTrigger value="files">Files</TabsTrigger><TabsTrigger value="provenance">Provenance</TabsTrigger></TabsList>
      <TabsContent value="overview"><Card><CardHeader><CardTitle>Model card</CardTitle><p className="text-sm text-gray-600">Documentation provided by the model contributor.</p></CardHeader><CardContent><MarkdownCard>{release.card || 'No model card provided.'}</MarkdownCard></CardContent></Card></TabsContent>
      <TabsContent value="schema"><Card><CardHeader><CardTitle>Model schema</CardTitle><p className="text-sm text-gray-600">Declared model metadata for version {release.version}.</p></CardHeader><CardContent className="space-y-5">{[['Architecture',release.metadata.architecture],['Training description',release.metadata.training_description],['Intended use',release.metadata.intended_use],['Limitations',release.metadata.limitations],['Parameter count',release.metadata.parameter_count],['Processing notes',release.metadata.methods]].filter(([,value]) => value !== undefined && value !== '').map(([label,value]) => <div key={label}><h3 className="font-semibold mb-2">{label}</h3><p className="data-zoo-card-text">{String(value)}</p></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="files"><Card><CardHeader><CardTitle>Model files</CardTitle><p className="text-sm text-gray-600">Download validated files from this published version.</p></CardHeader><CardContent><Table aria-label="Published model files"><TableHeader><TableRow><TableHead>File</TableHead><TableHead>Size</TableHead><TableHead>Scan status</TableHead><TableHead>Download</TableHead></TableRow></TableHeader><TableBody>{release.files.filter((file: any) => file.status === 'ready').map((file: any) => <TableRow key={file.id}><TableCell>{file.path}</TableCell><TableCell>{formatSize(file.size)}</TableCell><TableCell>{file.scan_status === 'clean' ? <Badge variant="secondary">Malware scan passed</Badge> : <span className="text-xs text-amber-800">{file.scan_status === 'not_scanned' ? 'Not malware scanned' : 'Scan status unavailable'}</span>}</TableCell><TableCell>{file.download_url ? <DownloadLink className="underline text-indigo-700" href={file.download_url} filename={file.path.split('/').pop()}><Download size={16} aria-hidden="true" />Download {file.path}</DownloadLink> : 'Unavailable'}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="provenance"><Card><CardHeader><CardTitle>Provenance and metadata</CardTitle></CardHeader><CardContent className="space-y-5"><div className="catalog-upstream"><h3 className="font-semibold mb-2">Exact upstream release</h3><p>Use this release ID when referencing this model in provenance.</p><code className="data-zoo-release-id">{release.id}</code></div><a className="underline text-indigo-700" href={`/api/v1/releases/${release.id}/manifest/`} target="_blank" rel="noreferrer">View release manifest and checksums</a>{release.metadata.citation && <section><h3 className="font-semibold mb-2">Citation</h3><MarkdownCard>{release.metadata.citation}</MarkdownCard></section>}<details><summary className="cursor-pointer font-medium">View complete metadata and provenance</summary><pre className="data-zoo-json">{JSON.stringify({release_id:release.id,published_at:release.published_at,parent:release.parent,metadata:release.metadata,sources:release.sources,manifest_sha256:release.manifest_sha256},null,2)}</pre></details></CardContent></Card></TabsContent>
    </Tabs>}
  </section>
}

export function PublicModelZoo({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth()
  const [models, setModels] = useState<Model[]>([])
  const [total, setTotal] = useState(0)
  const [ordering, setOrdering] = useState('newest')
  const detail = useCatalogDetail<Model>('model')
  const selected = detail.repository
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [next, setNext] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (detail.hasDetail) return
    let active = true
    setLoading(true); setError('')
    apiRequest(`/api/v1/repositories/?kind=model&scope=public&limit=100&ordering=${ordering}`).then(data => {
      if (!active) return
      setModels(data.results || data); setTotal(data.count ?? (data.results || data).length); setNext(data.next || null)
    }).catch(error => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh, ordering, detail.hasDetail])
  useEffect(() => {
    const refreshOnFocus = () => { if (!detail.hasDetail) setRefresh(value => value + 1) }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [detail.hasDetail])
  const catalogModels = useMemo<CatalogModel[]>(() => models.map(model => {
    const metadata = model.latest_release?.metadata || {}
    const task = String(metadata.task || 'other')
    return {
      id: model.id, name: model.name, description: model.description,
      category: ['segmentation', 'classification', 'detection', 'regression'].includes(task.toLowerCase()) ? task.toLowerCase() : 'other',
      modality: metadata.modality || 'Not specified', task, anatomy: metadata.anatomy || 'Not specified',
      author: model.owner, version: model.latest_release?.version || '',
      accuracy: 0, downloads: model.download_count || 0, stars: 0, rating: 0, releaseId: model.latest_release?.id, repositorySlug: model.slug, fileCount: model.latest_release?.file_count, totalSize: model.latest_release?.total_size,
      framework: metadata.framework || 'unknown', modelType: metadata.framework || 'unknown',
      createdAt: model.latest_release?.published_at || '', updatedAt: model.latest_release?.published_at || '',
      isVerified: false, license: metadata.license || 'Not specified',
      isUserModel: false, isPretrained: false, isCommunityModel: true,
      is_community_contribution: true,
    }
  }), [models])
  const more = async () => {
    if (!next) return
    setLoadingMore(true)
    try {
      const url = new URL(next, window.location.origin)
      const data = await apiRequest(url.pathname + url.search)
      setModels(previous => [...previous, ...data.results]); setNext(data.next)
    } catch (error: any) { setError(error.message) }
    finally { setLoadingMore(false) }
  }
  const Content = embedded ? 'section' : 'main'
  const Heading = embedded ? 'h2' : 'h1'
  return <div className={embedded ? 'space-y-5' : 'min-h-screen bg-gray-50'}>
    {!embedded && <header className="bg-white border-b"><nav aria-label="Oja Models navigation" className="page-container page-header"><a href="/" aria-label={'\u1ECCJ\u00C0 AI home'} className="font-bold text-xl">{'\u1ECCJ\u00C0 AI'}</a><div className="page-actions"><a href="/">Home</a>{user ? <Button asChild><a href="/dashboard">Manage my models</a></Button> : <><Button asChild variant="outline"><a href="/auth/login">Sign in</a></Button><Button asChild><a href="/auth/signup">Create account to contribute</a></Button></>}</div></nav></header>}
    <Content className={embedded ? 'data-zoo space-y-5' : 'data-zoo page-container page-content space-y-5'}>
      <div className="data-zoo-title"><div><Heading className="text-3xl font-bold">Oja Models</Heading><p className="text-gray-600 mt-2">Discover, download, and contribute versioned models across AI domains.</p></div>{!loading && !error && <Badge variant="secondary">{total} public {total === 1 ? 'model' : 'models'}</Badge>}</div>
      {detail.hasDetail && !selected && <div className="space-y-4"><Button variant="outline" onClick={detail.close}>Back to model list</Button>{detail.error ? <p role="alert">{detail.error}</p> : <p role="status">Loading model details...</p>}</div>}
      {selected && <ModelVersions model={selected} onBack={detail.close} releaseId={detail.releaseId} version={detail.version} onReleaseChange={detail.setRelease} section={detail.section} onSectionChange={detail.setSection} />}
      <div hidden={detail.hasDetail}>
        <section aria-label="Oja Models browser"><ModelZoo user={user} catalog={{ models: catalogModels, loading, error, onRefresh: () => setRefresh(value => value + 1), onSortChange: value => setOrdering(value === 'popular' ? 'downloads' : value), onReview: id => { const model = models.find(model => model.id === id); if (model) detail.open(model) } }} /></section>
        <div className="page-actions">{next && <Button variant="outline" disabled={loading || loadingMore} onClick={() => void more()}>{loadingMore ? 'Loading?' : 'Load more models'}</Button>}</div>
      </div>
    </Content>
  </div>
}
