import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from './api'

type Kind = 'model' | 'dataset'
type RepositoryLink = { id: string; owner: string; slug: string; latest_release: null | { id: string; version?: string } }

function navigate(url: URL, replace = false) {
  if (url.pathname + url.search === window.location.pathname + window.location.search) return
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function repositoryPath(kind: Kind, item: RepositoryLink) {
  return `/${kind === 'model' ? 'models' : 'datasets'}/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.slug)}`
}

export function catalogResourceUrl(kind: Kind, item: RepositoryLink) {
  const version = item.latest_release?.version
  return repositoryPath(kind, item) + (version ? `?${new URLSearchParams({ version })}` : '')
}

export function useCatalogDetail<T extends RepositoryLink>(kind: Kind) {
  const path = kind === 'model' ? '/models' : '/datasets'
  const oldPath = kind === 'model' ? '/model-zoo' : '/data-zoo'
  const prefix = kind === 'model' ? 'models' : 'datasets'
  const read = useCallback(() => {
    const match = window.location.pathname.match(new RegExp(`^/${prefix}/([^/]+)/([^/]+)/?$`))
    const legacy = [path, oldPath].includes(window.location.pathname.replace(/\/$/, ''))
    const params = match || legacy ? new URLSearchParams(window.location.search) : new URLSearchParams()
    let owner = '', slug = ''
    try { if (match) { owner = decodeURIComponent(match[1]); slug = decodeURIComponent(match[2]) } } catch { /* Invalid encoded paths resolve as unavailable. */ }
    return { repositoryId: legacy ? params.get('repository') || '' : '', owner, slug, named: !!match, releaseId: params.get('release') || '', version: params.get('version') || '', section: params.get('section') || 'overview' }
  }, [path, oldPath, prefix])
  const [route, setRoute] = useState(read)
  const routeKey = route.named ? `${route.owner}/${route.slug}` : route.repositoryId
  const hasDetail = route.named || !!route.repositoryId
  const [resolved, setResolved] = useState<{ key: string; repository: T } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const update = () => setRoute(read())
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [read])
  useEffect(() => {
    let active = true
    setResolved(null); setError('')
    if (!hasDetail) { setLoading(false); return }
    setLoading(true)
    const load = async () => {
      let data
      if (route.named) {
        const params = new URLSearchParams({ kind, scope: 'public', owner: route.owner, slug: route.slug, limit: '1' })
        const result = await apiRequest(`/api/v1/repositories/?${params}`)
        data = result.results?.[0]
      } else data = await apiRequest(`/api/v1/repositories/${encodeURIComponent(route.repositoryId)}/`)
      if (!active) return
      // Share links remain public-only, including when viewed by the owner.
      if (!data || data.kind !== kind || data.visibility !== 'public' || !data.latest_release) throw new Error(`This public ${kind} is unavailable.`)
      setResolved({ key: routeKey, repository: data })
    }
    load().catch(error => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [kind, routeKey, hasDetail, route.named, route.owner, route.slug, route.repositoryId])
  const repository = resolved?.key === routeKey ? resolved.repository : null
  const open = useCallback((item: RepositoryLink) => {
    navigate(new URL(catalogResourceUrl(kind, item), window.location.origin))
  }, [kind])
  const close = useCallback(() => navigate(new URL(path, window.location.origin)), [path])
  const setRelease = useCallback((_id: string, replace = false, version?: string) => {
    if (!repository || !version) return
    const url = new URL(repositoryPath(kind, repository), window.location.origin)
    url.searchParams.set('version', version)
    const section = new URLSearchParams(window.location.search).get('section')
    if (section && section !== 'overview') url.searchParams.set('section', section)
    navigate(url, replace)
  }, [kind, repository])
  const setSection = useCallback((section: string) => {
    const url = new URL(window.location.href)
    if (section === 'overview') url.searchParams.delete('section')
    else url.searchParams.set('section', section)
    navigate(url, true)
  }, [])
  return { ...route, hasDetail, repository, loading, error, open, close, setRelease, setSection }
}

type PublishedRelease = { id: string; version: string; status: string; repository?: string }

export function usePublishedVersions<T extends PublishedRelease>(repositoryId: string, latestId: string | undefined, requestedId: string, onDefault: (id: string, replace: boolean, version?: string) => void, requestedVersion = '') {
  const [releases, setReleases] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setReleases([])
    const load = async () => {
      const data = await apiRequest(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/releases/`)
      if (!active) return
      const published: T[] = data.filter((release: T) => release.status === 'published')
      let selected = requestedVersion ? published.find(release => release.version === requestedVersion) : published.find(release => release.id === (requestedId || latestId || published[0]?.id))
      if (!selected && requestedVersion) {
        const matches: T[] = await apiRequest(`/api/v1/repositories/${encodeURIComponent(repositoryId)}/releases/?version=${encodeURIComponent(requestedVersion)}`)
        if (!active) return
        selected = matches.find(release => release.status === 'published' && release.version === requestedVersion && release.repository === repositoryId)
      } else if (!selected && (requestedId || latestId)) {
        const release = await apiRequest(`/api/v1/releases/${encodeURIComponent(requestedId || latestId!)}/`)
        if (!active) return
        if (release.status === 'published' && release.repository === repositoryId) selected = release
      }
      if (!selected && (requestedId || requestedVersion || latestId)) throw new Error('The requested published version is unavailable.')
      setReleases(selected && !published.some(release => release.id === selected!.id) ? [...published, selected] : published)
      // Upgrade old UUID links and pin unversioned links to the displayed release.
      if (selected && !requestedVersion) onDefault(selected.id, true, selected.version)
    }
    load().catch(error => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [repositoryId, latestId, requestedId, requestedVersion, onDefault])
  const selectedId = requestedVersion ? releases.find(release => release.version === requestedVersion)?.id || '' : requestedId || latestId || releases[0]?.id || ''
  return { releases, loading, error, selectedId, release: releases.find(release => release.id === selectedId) }
}
