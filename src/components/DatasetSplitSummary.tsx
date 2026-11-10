import React from 'react'
import { type DatasetSplits, isSplitConfiguration } from '../lib/datasetSplits'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

export function DatasetSplitSummary({ splits = {}, files }: { splits?: DatasetSplits; files: { id: string; path: string }[] }) {
  if (!isSplitConfiguration(splits)) return Object.keys(splits).length ? <div><h3 className="font-semibold mb-2">Splits</h3><dl className="data-zoo-facts catalog-release-facts">{Object.entries(splits).map(([name, count]) => <div key={name}><dt>{name}</dt><dd>{count.toLocaleString()} declared examples</dd></div>)}</dl></div> : <p>No split configuration declared.</p>
  const names = { separate_files: 'Separate files', column: 'Split column', user_defined: 'User-defined percentages' }
  return <section className="space-y-4" aria-label="Dataset splitting configuration">
    <dl className="data-zoo-facts catalog-release-facts"><div><dt>Split status</dt><dd>{splits.status === 'predefined' ? 'Predefined' : 'Not provided'}</dd></div><div><dt>Splitting method</dt><dd>{names[splits.method]}</dd></div>{splits.column && <div><dt>Split column</dt><dd>{splits.column}</dd></div>}{splits.file && <div><dt>Data file</dt><dd>{files.find(file => file.id === splits.file)?.path || splits.file}</dd></div>}</dl>
    {splits.method === 'separate_files' && <Table aria-label="Partition files"><TableHeader><TableRow><TableHead>Partition</TableHead><TableHead>File</TableHead><TableHead>Artifact ID</TableHead></TableRow></TableHeader><TableBody>{Object.entries(splits.files || {}).map(([partition, id]) => <TableRow key={partition}><TableCell>{partition}</TableCell><TableCell>{files.find(file => file.id === id)?.path || 'Unavailable'}</TableCell><TableCell className="break-all">{id}</TableCell></TableRow>)}</TableBody></Table>}
    {splits.method === 'column' && <Table aria-label="Partition values"><TableHeader><TableRow><TableHead>Partition</TableHead><TableHead>Dataset value</TableHead></TableRow></TableHeader><TableBody>{Object.entries(splits.values || {}).map(([partition, value]) => <TableRow key={partition}><TableCell>{partition}</TableCell><TableCell>{value}</TableCell></TableRow>)}</TableBody></Table>}
    {splits.method === 'user_defined' && (splits.ratios ? <dl className="data-zoo-facts">{Object.entries(splits.ratios).map(([partition, ratio]) => <div key={partition}><dt>{partition}</dt><dd>{ratio}%</dd></div>)}</dl> : <p>Percentages can be configured later. No partitions have been generated.</p>)}
    {splits.status === 'predefined' && <p className="text-sm text-gray-600">Predefined partitions do not require percentages.</p>}
  </section>
}
