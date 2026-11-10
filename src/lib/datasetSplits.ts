export type SplitMethod = 'separate_files' | 'column' | 'user_defined'
export type SplitConfiguration = {
  status: 'predefined' | 'not_provided'; method: SplitMethod
  files?: Record<string, string> | null; file?: string | null
  column?: string | null; values?: Record<string, string> | null; ratios?: Record<string, number> | null
}
export type DatasetSplits = Record<string, number> | SplitConfiguration
type FileReference = { id: string; path: string }

export function isSplitConfiguration(splits: DatasetSplits): splits is SplitConfiguration {
  return typeof splits.method === 'string'
}

export function splitTemplate(method: SplitMethod, files: FileReference[]): SplitConfiguration {
  if (method === 'separate_files') {
    const matches = Object.fromEntries(['train', 'validation', 'test'].flatMap(partition => {
      const file = files.find(file => file.path.split('/').pop()?.toLowerCase().startsWith(`${partition}.`))
      return file ? [[partition, file.id]] : []
    }))
    return { status: 'predefined', method, ratios: null, files: Object.keys(matches).length ? matches : { train: 'train.csv', validation: 'validation.csv', test: 'test.csv' } }
  }
  if (method === 'column') {
    const candidates = files.filter(file => /\.(csv|tsv|jsonl|json|parquet)$/i.test(file.path) && !/schema/i.test(file.path))
    return { status: 'predefined', method, ...(candidates.length === 1 ? { file: candidates[0].id } : {}), column: 'split', values: { train: 'train', validation: 'validation', test: 'test' }, ratios: null }
  }
  return { status: 'not_provided', method, column: null, values: null, ratios: null }
}

// New versions receive new artifact IDs. Preserve relative paths for re-upload,
// then let Django resolve them against files attached to the new version.
export function datasetMetadataForNewVersion(metadata: Record<string, any>, files: FileReference[]) {
  if (!metadata.splits || !isSplitConfiguration(metadata.splits)) return metadata
  const splits = { ...metadata.splits }
  const path = (id: string) => files.find(file => file.id === id)?.path || id
  if (splits.files) splits.files = Object.fromEntries(Object.entries(splits.files as Record<string, string>).map(([key, id]) => [key, path(id)]))
  if (splits.file) splits.file = path(splits.file)
  return { ...metadata, splits }
}
