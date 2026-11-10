import React from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DatasetSplitSummary } from './DatasetSplitSummary'
import { datasetMetadataForNewVersion, splitTemplate } from '../lib/datasetSplits'

afterEach(cleanup)

it('renders old splits as example counts', () => {
  render(<DatasetSplitSummary splits={{ train: 70, test: 30 }} files={[]} />)
  expect(screen.getByText('70 declared examples')).toBeTruthy()
})

it('renders separate files with their actual paths and artifact IDs', () => {
  render(<DatasetSplitSummary splits={{ status: 'predefined', method: 'separate_files', files: { train: 'file-1', test: 'file-2' }, ratios: null }} files={[{ id: 'file-1', path: 'data/train.csv' }, { id: 'file-2', path: 'data/test.csv' }]} />)
  expect(screen.getByRole('table', { name: 'Partition files' })).toBeTruthy()
  expect(screen.getByText('data/train.csv')).toBeTruthy()
  expect(screen.getByText('file-1')).toBeTruthy()
  expect(screen.queryByText(/declared examples/)).toBeNull()
})

it('renders column assignments with their case-sensitive dataset values', () => {
  render(<DatasetSplitSummary splits={{ status: 'predefined', method: 'column', column: 'partition', values: { train: 'Train', test: 'Test' }, ratios: null }} files={[]} />)
  expect(screen.getByText('partition')).toBeTruthy()
  expect(screen.getByRole('table', { name: 'Partition values' })).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'Train', exact: true })).toBeTruthy()
})

it('shows deferred ratios or configurable percentages, including no validation partition', () => {
  const { rerender } = render(<DatasetSplitSummary splits={{ status: 'not_provided', method: 'user_defined', ratios: null }} files={[]} />)
  expect(screen.getByText(/Percentages can be configured later/)).toBeTruthy()
  rerender(<DatasetSplitSummary splits={{ status: 'not_provided', method: 'user_defined', ratios: { train: 80, test: 20 } }} files={[]} />)
  expect(screen.getByText('80%')).toBeTruthy()
  expect(screen.getByText('20%')).toBeTruthy()
  expect(screen.queryByText('validation')).toBeNull()
})

it('generates references from attached files and remaps IDs for a new version without mutating old metadata', () => {
  const files = [{ id: 'a', path: 'train.csv' }, { id: 'b', path: 'test.csv' }]
  const splits = splitTemplate('separate_files', files)
  expect(splits.files).toEqual({ train: 'a', test: 'b' })
  const metadata = { splits, features: [{ name: 'age', dtype: 'integer' }] }
  const copied = datasetMetadataForNewVersion(metadata, files)
  expect(copied.splits.files).toEqual({ train: 'train.csv', test: 'test.csv' })
  expect(metadata.splits.files).toEqual({ train: 'a', test: 'b' })
  expect(copied.features).toEqual(metadata.features)
})
