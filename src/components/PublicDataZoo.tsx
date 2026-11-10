import React, { useEffect, useMemo, useState } from 'react'
import { Database, Search, Download } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../lib/api'
import { Button } from './ui/button'
import { DownloadLink } from './DownloadLink'
import { CatalogColumns, DATASET_COLUMNS, useCatalogColumns } from './CatalogColumns'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { RepositoryWorkspace } from './RepositoryWorkspace'
import { CatalogViewSwitch, type CatalogView } from './CatalogViewSwitch'
import { MarkdownCard } from './MarkdownCard'
import { DatasetSplitSummary } from './DatasetSplitSummary'
import { type DatasetSplits } from '../lib/datasetSplits'
import { compareCatalogItems } from '../lib/catalogSort'
import { formatArtifactSize as sizeLabel } from '../lib/catalogFormat'
import { useCatalogDetail, usePublishedVersions } from '../lib/catalogDetail'

type Metadata = {
  citation?: string; task?: string; modality?: string; license?: string; languages?: string[]; tags?: string[]
  splits?: DatasetSplits; features?: { name: string; dtype: string; description?: string }[]
}
type Dataset = {
  id: string; name: string; slug: string; owner: string; description: string
  download_count?: number
  latest_release: null | { id: string; version: string; metadata: Metadata; published_at: string; file_count: number; total_size: number }
}
type Release = {
  id: string; version: string; status: string; metadata: Metadata; published_at: string; card: string
  parent: string | null; sources: unknown[]; manifest_sha256: string
  files: { id: string; path: string; size: number; status: string; scan_status: string; download_url: string | null }[]
}

function DatasetVersions({ dataset, onBack, releaseId, version, onReleaseChange, section, onSectionChange }: { dataset: Dataset; onBack: () => void; releaseId: string; version: string; onReleaseChange: (id: string, replace?: boolean, version?: string) => void; section: string; onSectionChange: (section: string) => void }) {
  const { releases, selectedId: selected, release, error, loading } = usePublishedVersions<Release>(dataset.id, dataset.latest_release?.id, releaseId, onReleaseChange, version)
  const activeSection = ['overview', 'schema', 'files', 'provenance'].includes(section) ? section : 'overview'
  return <section className="data-zoo-detail space-y-5" aria-label="Dataset versions">
    <Button variant="outline" onClick={onBack}>Back to dataset list</Button>
    <Card className="catalog-release-header">
      <CardHeader>
        <p className="catalog-eyebrow">Dataset repository</p>
        <CardTitle className="catalog-release-title">{dataset.name}</CardTitle>
        <p className="text-sm text-gray-600">{dataset.owner}/{dataset.slug}</p>
        <p className="data-zoo-description">{dataset.description}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && <p role="status">Loading published versions...</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && !releases.length && <p>No published versions are available.</p>}
        {!!releases.length && <div className="catalog-release-toolbar">
          <div><label htmlFor="public-dataset-version" className="block text-sm font-medium mb-2">Version</label><select id="public-dataset-version" value={selected} onChange={event => onReleaseChange(event.target.value, false, releases.find(value => value.id === event.target.value)?.version)}>{!releases.some(value => value.id === selected) && <option value={selected} disabled>Requested version unavailable</option>}{releases.map(value => <option key={value.id} value={value.id}>{value.version}</option>)}</select></div>
          {release && <><Badge variant="secondary">Published</Badge><span className="text-sm text-gray-600">{new Date(release.published_at).toLocaleDateString()}</span><Button asChild><DownloadLink filename={`${dataset.slug}-${release.version}.zip`} href={`/api/v1/releases/${release.id}/download/`}><Download size={16} aria-hidden="true" />Download Dataset <span title="Completed downloads">({(dataset.download_count || 0).toLocaleString()})</span></DownloadLink></Button></>}
        </div>}
        {release && <dl className="data-zoo-facts catalog-release-facts">{[['Task', release.metadata.task], ['Data type', release.metadata.modality], ['License', release.metadata.license], ['Files', String(release.files.filter(file => file.status === 'ready').length)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not specified'}</dd></div>)}</dl>}
      </CardContent>
    </Card>
    {release && <Tabs value={activeSection} onValueChange={onSectionChange} className="platform-tabs catalog-detail-tabs">
      <TabsList aria-label="Dataset details"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="schema">Schema</TabsTrigger><TabsTrigger value="files">Files</TabsTrigger><TabsTrigger value="provenance">Provenance</TabsTrigger></TabsList>
      <TabsContent value="overview"><Card><CardHeader><CardTitle>Dataset card</CardTitle><p className="text-sm text-gray-600">Documentation provided by the dataset contributor.</p></CardHeader><CardContent><MarkdownCard>{release.card || 'No dataset card provided.'}</MarkdownCard></CardContent></Card></TabsContent>
      <TabsContent value="schema"><Card><CardHeader><CardTitle>Dataset schema</CardTitle><p className="text-sm text-gray-600">Declared splits and features for version {release.version}.</p></CardHeader><CardContent className="space-y-5">
        <DatasetSplitSummary splits={release.metadata.splits} files={release.files} />
        {release.metadata.features?.length ? <Table aria-label="Dataset features"><TableHeader><TableRow><TableHead>Feature</TableHead><TableHead>Data type</TableHead><TableHead>Description</TableHead></TableRow></TableHeader><TableBody>{release.metadata.features.map(feature => <TableRow key={feature.name}><TableCell>{feature.name}</TableCell><TableCell><code>{feature.dtype}</code></TableCell><TableCell>{feature.description || 'Not provided'}</TableCell></TableRow>)}</TableBody></Table> : <p>No feature schema declared in this version's metadata.</p>}
      </CardContent></Card></TabsContent>
      <TabsContent value="files"><Card><CardHeader><CardTitle>Dataset files</CardTitle><p className="text-sm text-gray-600">Download validated files from this published version.</p></CardHeader><CardContent><Table aria-label="Published dataset files"><TableHeader><TableRow><TableHead>File</TableHead><TableHead>Size</TableHead><TableHead>Scan status</TableHead><TableHead>Download</TableHead></TableRow></TableHeader><TableBody>{release.files.filter(file => file.status === 'ready').map(file => <TableRow key={file.id}><TableCell>{file.path}</TableCell><TableCell>{sizeLabel(file.size)}</TableCell><TableCell>{file.scan_status === 'clean' ? <Badge variant="secondary">Malware scan passed</Badge> : <span className="text-xs text-amber-800">{file.scan_status === 'not_scanned' ? 'Not malware scanned' : 'Scan status unavailable'}</span>}</TableCell><TableCell>{file.download_url ? <DownloadLink className="underline text-indigo-700" href={file.download_url} filename={file.path.split('/').pop()}><Download size={16} aria-hidden="true" />Download {file.path}</DownloadLink> : 'Unavailable'}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="provenance"><Card><CardHeader><CardTitle>Provenance and metadata</CardTitle></CardHeader><CardContent className="space-y-5">
        <div className="catalog-upstream"><h3 className="font-semibold mb-2">Exact upstream release</h3><p>Use this release ID when referencing this dataset in model or dataset provenance.</p><code className="data-zoo-release-id">{release.id}</code></div>
        <a className="underline text-indigo-700" href={`/api/v1/releases/${release.id}/manifest/`} target="_blank" rel="noreferrer">View release manifest and checksums</a>
        {release.metadata.citation && <section><h3 className="font-semibold mb-2">Citation</h3><MarkdownCard>{release.metadata.citation}</MarkdownCard></section>}<details><summary className="cursor-pointer font-medium">View complete metadata and provenance</summary><pre className="data-zoo-json">{JSON.stringify({ release_id: release.id, published_at: release.published_at, parent: release.parent, metadata: release.metadata, sources: release.sources, manifest_sha256: release.manifest_sha256 }, null, 2)}</pre></details>
      </CardContent></Card></TabsContent>
    </Tabs>}
  </section>
}

export function PublicDataZoo({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const detail = useCatalogDetail<Dataset>('dataset')
  const selected = detail.repository
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [next, setNext] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [task, setTask] = useState('')
  const [modalities, setModalities] = useState<string[]>([])
  const [license, setLicense] = useState('')
  const [ordering, setOrdering] = useState('newest')
  const [view, setView] = useState<CatalogView>('cards')
  const columns = useCatalogColumns('dataset', DATASET_COLUMNS)
  useEffect(() => {
    if (detail.hasDetail) return
    let active = true
    setLoading(true); setError('')
    apiRequest(`/api/v1/repositories/?kind=dataset&scope=public&limit=100&ordering=${ordering}`).then(data => {
      if (!active) return
      setDatasets(data.results); setNext(data.next); setTotal(data.count)
    }).catch(error => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh, ordering, detail.hasDetail])
  useEffect(() => {
    const refreshOnFocus = () => { if (!detail.hasDetail) setRefresh(value => value + 1) }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [detail.hasDetail])
  const options = (key: 'task' | 'modality' | 'license') => Array.from(new Set(datasets.map(dataset => dataset.latest_release?.metadata[key]).filter((value): value is string => !!value))).sort()
  const visible = useMemo(() => datasets.filter(dataset => {
    const metadata = dataset.latest_release?.metadata || {}
    const searchable = [dataset.name, dataset.description, dataset.owner, dataset.slug, metadata.task, ...(metadata.tags || []), ...(metadata.languages || [])].join(' ').toLowerCase()
    return searchable.includes(search.trim().toLowerCase()) && (!task || metadata.task === task) && (!modalities.length || modalities.includes(metadata.modality || '')) && (!license || metadata.license === license)
  }).sort((a, b) => compareCatalogItems({id:a.id,name:a.name,downloads:a.download_count,published:a.latest_release?.published_at}, {id:b.id,name:b.name,downloads:b.download_count,published:b.latest_release?.published_at}, ordering)), [datasets, search, task, modalities, license, ordering])
  const clearFilters = () => { setSearch(''); setTask(''); setModalities([]); setLicense('') }
  const more = async () => {
    if (!next) return
    setLoadingMore(true); setError('')
    try {
      const url = new URL(next, window.location.origin)
      const data = await apiRequest(url.pathname + url.search)
      setDatasets(previous => [...previous, ...data.results.filter((item: Dataset) => !previous.some(existing => existing.id === item.id))]); setNext(data.next); setTotal(data.count)
    } catch (error: any) { setError(error.message) }
    finally { setLoadingMore(false) }
  }
  const Content = embedded ? 'section' : 'main'
  const Heading = embedded ? 'h2' : 'h1'
  return <div className={embedded ? 'space-y-5' : 'min-h-screen bg-gray-50'}>
    {!embedded && <header className="bg-white border-b"><nav aria-label="Oja Datasets navigation" className="page-container page-header"><a href="/" aria-label={'\u1ECCJ\u00C0 AI home'} className="font-bold text-xl">{'\u1ECCJ\u00C0 AI'}</a><div className="page-actions"><a href="/">Home</a>{user ? <Button asChild><a href="/dashboard">Dashboard</a></Button> : <><Button asChild variant="outline"><a href="/auth/login">Sign in</a></Button><Button asChild><a href="/auth/signup">Create account to contribute</a></Button></>}</div></nav></header>}
    <Content className={embedded ? 'data-zoo space-y-5' : 'data-zoo page-container page-content space-y-5'}>
      <div className="data-zoo-title"><div><Heading className="text-3xl font-bold">Oja Datasets</Heading><p className="text-gray-600 mt-2">Discover, download, and contribute versioned datasets across AI domains.</p></div>{!loading && !error && <Badge variant="secondary">{total} public {total === 1 ? 'dataset' : 'datasets'}</Badge>}</div>
      {detail.hasDetail ? (selected ? <DatasetVersions key={selected.id} dataset={selected} onBack={detail.close} releaseId={detail.releaseId} version={detail.version} onReleaseChange={detail.setRelease} section={detail.section} onSectionChange={detail.setSection} /> : <div className="space-y-4"><Button variant="outline" onClick={detail.close}>Back to dataset list</Button>{detail.error ? <p role="alert">{detail.error}</p> : <p role="status">Loading dataset details...</p>}</div>) : <Tabs defaultValue="browse" className="platform-tabs">
        <TabsList><TabsTrigger value="browse">Browse Datasets</TabsTrigger><TabsTrigger value="contribute">Contribute</TabsTrigger><TabsTrigger value="guidelines">Guidelines</TabsTrigger></TabsList>
        <TabsContent value="browse">
          <section aria-label="Oja Datasets browser" className="data-zoo-layout">
            <aside className="data-zoo-sidebar" aria-label="Dataset filters">
              <Card><CardHeader><CardTitle>Tasks</CardTitle></CardHeader><CardContent className="space-y-3"><Button variant={task ? 'ghost' : 'secondary'} onClick={() => setTask('')} aria-pressed={!task}>All datasets</Button>{options('task').map(value => <Button key={value} variant={task === value ? 'secondary' : 'ghost'} onClick={() => setTask(value)} aria-pressed={task === value}>{value}</Button>)}</CardContent></Card>
              <Card><CardHeader><CardTitle>Data Types</CardTitle></CardHeader><CardContent className="space-y-3">{options('modality').map(value => <label className="data-zoo-checkbox" key={value}><input type="checkbox" checked={modalities.includes(value)} onChange={event => setModalities(previous => event.target.checked ? [...previous, value] : previous.filter(item => item !== value))} />{value}</label>)}{!options('modality').length && <p className="text-sm text-gray-600">Data types appear as datasets are published.</p>}</CardContent></Card>
              <Card><CardHeader><CardTitle>License</CardTitle></CardHeader><CardContent><label className="sr-only" htmlFor="dataset-license">Dataset license</label><select id="dataset-license" value={license} onChange={event => setLicense(event.target.value)}><option value="">All licenses</option>{options('license').map(value => <option key={value}>{value}</option>)}</select></CardContent></Card>
              <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardHeader>
                  <CardTitle className="text-sm text-blue-700 flex items-center space-x-2">
                    <Database className="h-4 w-4" aria-hidden="true" />
                    <span>Your Datasets</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-blue-600 mb-3">{user ? 'Manage your uploads and published versions from your dashboard.' : 'Sign in to upload datasets and manage your own repositories.'}</p>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="sm" asChild><a href={user ? '/dashboard?tab=upload-data' : '/auth/login'}>{user ? 'Manage Your Datasets' : 'Sign in to contribute'}</a></Button>
                </CardContent>
              </Card>
              <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
            </aside>
            <div className="data-zoo-results space-y-5">
              <div className="data-zoo-toolbar"><CatalogViewSwitch kind="dataset" value={view} onChange={setView} />{view === 'table' && <CatalogColumns kind="dataset" columns={DATASET_COLUMNS} state={columns} />}<div className="data-zoo-search"><Search size={18} aria-hidden="true" /><Input aria-label="Search datasets" placeholder="Search datasets, authors, tasks, or tags..." value={search} onChange={event => setSearch(event.target.value)} /></div><label className="sr-only" htmlFor="dataset-sort">Sort datasets</label><select id="dataset-sort" value={ordering} onChange={event => setOrdering(event.target.value)}><option value="newest">Newest release</option><option value="downloads">Most downloaded</option><option value="name">Name A-Z</option></select><Button variant="outline" disabled={loading || loadingMore} onClick={() => setRefresh(value => value + 1)}>Refresh datasets</Button></div>
              {loading && <p role="status">Loading public datasets...</p>}
              {error && <p role="alert" className="text-red-800">{error}</p>}
              {!loading && <><p className="text-sm text-gray-600" role="status">Showing {visible.length} of {datasets.length} loaded datasets{next ? ` (${total} available). Load more to search and filter additional datasets.` : '.'}</p>
                {!visible.length && !error && <Card><CardContent className="data-zoo-empty"><Database aria-hidden="true" /><h2 className="font-semibold">No datasets found</h2><p>Try different filters or contribute a public dataset.</p><Button variant="outline" onClick={clearFilters}>Reset search and filters</Button></CardContent></Card>}
                {view === 'table' ? <div className="catalog-results-table"><Table aria-label="Public datasets"><TableHeader><TableRow><TableHead>Dataset</TableHead>{columns.visible('version') && <TableHead>Version</TableHead>}{columns.visible('task') && <TableHead>Task</TableHead>}{columns.visible('modality') && <TableHead>Data type</TableHead>}{columns.visible('license') && <TableHead>License</TableHead>}{columns.visible('files') && <TableHead>Files</TableHead>}{columns.visible('size') && <TableHead>Size</TableHead>}{columns.visible('downloads') && <TableHead>Downloads</TableHead>}<TableHead>Details</TableHead></TableRow></TableHeader><TableBody>{visible.map(dataset => <TableRow key={dataset.id}>
                  <TableCell><strong>{dataset.name}</strong><span className="block text-sm text-gray-600">{dataset.owner}/{dataset.slug}</span></TableCell>{columns.visible('version') && <TableCell>{dataset.latest_release?.version}</TableCell>}{columns.visible('task') && <TableCell>{dataset.latest_release?.metadata.task}</TableCell>}{columns.visible('modality') && <TableCell>{dataset.latest_release?.metadata.modality}</TableCell>}{columns.visible('license') && <TableCell>{dataset.latest_release?.metadata.license}</TableCell>}{columns.visible('files') && <TableCell>{dataset.latest_release?.file_count ?? 0}</TableCell>}{columns.visible('size') && <TableCell>{sizeLabel(dataset.latest_release?.total_size ?? 0)}</TableCell>}{columns.visible('downloads') && <TableCell><span className="catalog-download-count"><Download aria-hidden="true" />{(dataset.download_count || 0).toLocaleString()}</span></TableCell>}<TableCell><div className="page-actions"><Button variant="outline" size="sm" onClick={() => detail.open(dataset)} aria-label={`View dataset ${dataset.name}`}>View Dataset</Button></div></TableCell>
                </TableRow>)}</TableBody></Table></div> : <div className="data-zoo-grid">{visible.map(dataset => {
                  const release = dataset.latest_release
                  return <Card key={dataset.id} className="data-zoo-dataset"><CardHeader><div className="data-zoo-title"><Database className="text-indigo-600" aria-hidden="true" />{release && <Badge variant="outline">v{release.version}</Badge>}</div><CardTitle>{dataset.name}</CardTitle><p className="text-sm text-gray-600">{dataset.owner}/{dataset.slug}</p><p className="data-zoo-description">{dataset.description || 'No description provided.'}</p></CardHeader><CardContent className="space-y-4"><div className="page-actions">{[release?.metadata.task, release?.metadata.modality, release?.metadata.license].filter(Boolean).map((value, index) => <Badge key={index} variant="secondary">{value}</Badge>)}</div><dl className="data-zoo-facts"><div><dt>Files</dt><dd>{release?.file_count ?? 0}</dd></div><div><dt>Size</dt><dd>{sizeLabel(release?.total_size ?? 0)}</dd></div><div><dt>Downloads</dt><dd className="catalog-download-count" title="File and ZIP streams completed by the server; disk saves cannot be verified"><Download aria-hidden="true" />{(dataset.download_count || 0).toLocaleString()}</dd></div><div><dt>Published</dt><dd>{release?.published_at ? new Date(release.published_at).toLocaleDateString() : 'Not specified'}</dd></div></dl><Button className="w-full" onClick={() => detail.open(dataset)} aria-label={`View dataset ${dataset.name}`}>View Dataset</Button></CardContent></Card>
                })}</div>}
                {next && <Button variant="outline" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading more datasets...' : 'Load more datasets'}</Button>}
              </>}
            </div>
          </section>
        </TabsContent>
        <TabsContent value="contribute">{user ? <RepositoryWorkspace kind="dataset" /> : <Card><CardHeader><CardTitle>Contribute a dataset</CardTitle><p>Create an account or sign in to upload files, document your dataset, and publish a version.</p></CardHeader><CardContent className="page-actions"><Button asChild><a href="/auth/login">Sign in to contribute</a></Button><Button asChild variant="outline"><a href="/auth/signup">Create account</a></Button></CardContent></Card>}</TabsContent>
        <TabsContent value="guidelines"><Card><CardHeader><CardTitle>Dataset contribution guidelines</CardTitle></CardHeader><CardContent className="space-y-4"><p>Upload files to a dataset repository and create a version. Complete the dataset card, license, task, data type, collection method, intended use, limitations, and personal data declaration.</p><p>Describe splits and features in the dataset metadata. Reference exact published release IDs for derived datasets, and confirm your rights to share the files.</p><p>Files must pass upload validation before publication. Public datasets must declare that they contain no personal data. Published versions are immutable; create a new version to update a dataset.</p><p>Review the scan status shown with each file. A file marked “Not malware scanned” has not undergone malware scanning.</p></CardContent></Card></TabsContent>
      </Tabs>}
    </Content>
  </div>
}
