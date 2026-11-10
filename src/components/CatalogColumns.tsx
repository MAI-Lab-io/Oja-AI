import React, { useEffect, useState } from 'react'
import { Columns3 } from 'lucide-react'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'

type Column = { id: string; label: string; locked?: boolean }
export const MODEL_COLUMNS: Column[] = [
  { id: 'select', label: 'Selection' }, { id: 'name', label: 'Model', locked: true },
  { id: 'version', label: 'Version' }, { id: 'task', label: 'Task' },
  { id: 'framework', label: 'Framework' }, { id: 'license', label: 'License' },
  { id: 'files', label: 'Files' }, { id: 'size', label: 'Size' },
  { id: 'downloads', label: 'Downloads' }, { id: 'details', label: 'Details', locked: true },
]
export const DATASET_COLUMNS: Column[] = [
  { id: 'name', label: 'Dataset', locked: true }, { id: 'version', label: 'Version' },
  { id: 'task', label: 'Task' }, { id: 'modality', label: 'Data type' },
  { id: 'license', label: 'License' }, { id: 'files', label: 'Files' },
  { id: 'size', label: 'Size' }, { id: 'downloads', label: 'Downloads' },
  { id: 'details', label: 'Details', locked: true },
]

export function useCatalogColumns(kind: 'model' | 'dataset', columns: Column[]) {
  const key = `oja.catalog.${kind}.hidden-columns.v1`
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]')
      return Array.isArray(stored) ? stored.filter(id => columns.some(column => column.id === id && !column.locked)) : []
    } catch { return [] }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(hidden)) } catch { /* Browsing works when storage is disabled. */ } }, [key, hidden])
  return {
    visible: (id: string) => !hidden.includes(id),
    toggle: (id: string) => {
      if (!columns.some(column => column.id === id && !column.locked)) return
      setHidden(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id])
    },
    reset: () => setHidden([]),
  }
}

export function CatalogColumns({ kind, columns, state }: { kind: 'model' | 'dataset'; columns: Column[]; state: ReturnType<typeof useCatalogColumns> }) {
  return <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="outline" aria-label={`${kind === 'model' ? 'Model' : 'Dataset'} table columns`}><Columns3 size={16} aria-hidden="true" />Columns</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="catalog-column-menu">
      <DropdownMenuLabel>Show table columns</DropdownMenuLabel><DropdownMenuSeparator />
      {columns.map(column => <DropdownMenuCheckboxItem key={column.id} checked={state.visible(column.id)} disabled={column.locked} onSelect={event => event.preventDefault()} onCheckedChange={() => state.toggle(column.id)}>{column.label}{column.locked ? ' (always shown)' : ''}</DropdownMenuCheckboxItem>)}
      <DropdownMenuSeparator /><DropdownMenuItem onSelect={state.reset}>Restore default columns</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
