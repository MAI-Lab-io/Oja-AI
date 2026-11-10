type SortValue = { id: string; name: string; downloads?: number; published?: string }
const date = (value?: string) => { const result = Date.parse(value || ''); return Number.isFinite(result) ? result : 0 }

export function compareCatalogItems(a: SortValue, b: SortValue, order: string) {
  const name = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  const newest = date(b.published) - date(a.published)
  if (order === 'name') return name || a.id.localeCompare(b.id)
  if (order === 'downloads' || order === 'popular') return (Number(b.downloads) || 0) - (Number(a.downloads) || 0) || newest || name || a.id.localeCompare(b.id)
  return newest || name || a.id.localeCompare(b.id)
}
