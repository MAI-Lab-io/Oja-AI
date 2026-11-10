import React, { useEffect, useState } from 'react'
import { ArrowRight, Brain, Database, Download } from 'lucide-react'
import { apiRequest } from '../lib/api'
import { catalogResourceUrl } from '../lib/catalogDetail'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

type Resource = {
  id: string; kind: 'model' | 'dataset'; visibility: string; owner: string; slug: string
  name: string; description: string; download_count: number
  latest_release: null | { id: string; version: string; published_at?: string; metadata: Record<string, unknown> }
}

export function HomeMarketPreview() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    const kinds = ['model', 'dataset'] as const
    Promise.allSettled(kinds.map(kind => apiRequest(`/api/v1/repositories/?kind=${kind}&scope=public&ordering=newest&limit=3`)))
      .then(results => {
        if (!active) return
        const groups = results.map((result, index): Resource[] => result.status === 'fulfilled'
          ? (Array.isArray(result.value.results) ? result.value.results : []).filter((item: Resource) => item.kind === kinds[index] && item.visibility === 'public' && item.latest_release).slice(0, 3) : [])
        // Include both resource types when available, then fill the third slot.
        const selected = groups.flatMap(group => group.slice(0, 1))
        const remaining = groups.flatMap(group => group.slice(1)).sort((a, b) => (Date.parse(b.latest_release?.published_at || '') || 0) - (Date.parse(a.latest_release?.published_at || '') || 0))
        setResources([...selected, ...remaining].slice(0, 3))
        setError(results.some(result => result.status === 'rejected'))
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  return <section aria-labelledby="home-market-heading" className="home-market">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="home-market-intro text-center">
        <h2 id="home-market-heading" className="text-3xl md:text-4xl font-bold text-gray-900">Explore the market</h2>
        <p className="text-xl text-gray-600">Discover the latest public models and datasets shared by the community.</p>
      </div>
      <div aria-live="polite">
        {loading ? <p className="home-market-message">Loading published models and datasets...</p>
          : !resources.length ? <p className="home-market-message">{error ? 'Unable to load the market right now. Please try Show more.' : 'No public models or datasets have been published yet.'}</p>
            : <div className="home-market-grid">{resources.map(item => {
              const kind = item.kind
              const Icon = kind === 'model' ? Brain : Database
              const release = item.latest_release!
              const tags = [release.metadata.task, release.metadata[kind === 'model' ? 'framework' : 'modality'], release.metadata.license]
                .filter((value): value is string => typeof value === 'string' && !!value)
              const url = catalogResourceUrl(kind, item)
              return <Card key={item.id} className="home-market-card hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="home-market-card-meta"><Badge variant="secondary"><Icon size={14} aria-hidden="true" />{kind === 'model' ? 'Model' : 'Dataset'}</Badge><Badge variant="outline">v{release.version}</Badge></div>
                  <CardTitle className="text-lg font-semibold text-gray-900"><a href={url}>{item.name}</a></CardTitle>
                  <p className="text-sm text-gray-600">{item.owner}</p>
                  <p className="home-market-description">{item.description || 'Explore the documentation and published files for this repository.'}</p>
                </CardHeader>
                <CardContent>
                  <div className="home-market-tags">{tags.map((tag, index) => <Badge variant="secondary" key={`${tag}-${index}`}>{tag}</Badge>)}</div>
                  <div className="home-market-card-footer">
                    <span className="home-market-downloads" title="Completed download streams"><Download size={16} aria-hidden="true" />{(item.download_count || 0).toLocaleString()} downloads</span>
                  </div>
                  <Button asChild className="w-full home-market-view-button"><a href={url}>View {kind === 'model' ? 'Model' : 'Dataset'}</a></Button>
                </CardContent>
              </Card>
            })}</div>}
      </div>
      <div className="home-market-more">
        <Button asChild size="lg" className="home-market-more-button bg-indigo-600 hover:bg-indigo-700 text-white"><a href="/models">Show more <ArrowRight size={16} aria-hidden="true" /></a></Button>
      </div>
    </div>
  </section>
}
