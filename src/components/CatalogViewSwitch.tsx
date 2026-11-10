import React from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { Button } from './ui/button'

export type CatalogView = 'cards' | 'table'

export function CatalogViewSwitch({ value, onChange, kind }: { value: CatalogView; onChange: (value: CatalogView) => void; kind: 'model' | 'dataset' }) {
  return <div className="catalog-view-switch" role="group" aria-label={`${kind === 'model' ? 'Model' : 'Dataset'} view`}>
    <Button variant={value === 'cards' ? 'secondary' : 'ghost'} aria-pressed={value === 'cards'} aria-label={`${kind} card view`} onClick={() => onChange('cards')}><LayoutGrid size={16} aria-hidden="true" />Cards</Button>
    <Button variant={value === 'table' ? 'secondary' : 'ghost'} aria-pressed={value === 'table'} aria-label={`${kind} table view`} onClick={() => onChange('table')}><List size={16} aria-hidden="true" />Table</Button>
  </div>
}
