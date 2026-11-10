import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HomeMarketPreview } from './HomeMarketPreview'
import { apiRequest } from '../lib/api'

vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

const resource = (kind: 'model' | 'dataset', name: string) => ({
  id: name, kind, visibility: 'public', name, slug: 'sample', owner: 'alice',
  description: 'Contributor documentation summary.', download_count: 17,
  latest_release: { id: 'release', version: '1.0.0', metadata: { task: 'classification', framework: 'pytorch', modality: 'tabular', license: 'MIT' } },
})

it('shows bounded public previews and links to the correct catalog and exact release', async () => {
  vi.mocked(apiRequest).mockImplementation(async path => {
    const kind = String(path).includes('kind=model') ? 'model' : 'dataset'
    return { results: [
      resource(kind, `${kind} example`),
      { ...resource(kind, 'Private resource'), visibility: 'private' },
      { ...resource(kind, 'Unpublished resource'), latest_release: null },
      ...[2, 3, 4].map(index => resource(kind, `${kind} ${index}`)),
    ] }
  })
  render(<HomeMarketPreview />)
  await screen.findByRole('link', { name: 'model example' })
  await screen.findByRole('link', { name: 'dataset example' })
  expect(apiRequest).toHaveBeenCalledWith('/api/v1/repositories/?kind=model&scope=public&ordering=newest&limit=3')
  expect(apiRequest).toHaveBeenCalledWith('/api/v1/repositories/?kind=dataset&scope=public&ordering=newest&limit=3')
  expect(document.querySelectorAll('.home-market-grid')).toHaveLength(1)
  expect(document.querySelectorAll('.home-market-card')).toHaveLength(3)
  expect(screen.getByRole('link', { name: 'model example' }).getAttribute('href')).toBe('/models/alice/sample?version=1.0.0')
  expect(screen.getByRole('link', { name: 'dataset example' }).getAttribute('href')).toBe('/datasets/alice/sample?version=1.0.0')
  expect(screen.getAllByRole('link', { name: 'Show more' })).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Show more' }).getAttribute('href')).toBe('/models')
  expect(screen.getAllByText('17 downloads')).toHaveLength(3)
  expect(screen.queryByText('Private resource')).toBeNull()
  expect(screen.queryByText('Unpublished resource')).toBeNull()
  expect(screen.queryByRole('link', { name: /Download/ })).toBeNull()
})

it('keeps successful previews visible if the other catalog fails', async () => {
  vi.mocked(apiRequest).mockImplementation(async path => {
    if (String(path).includes('kind=model')) throw new Error('Unavailable')
    return { results: [resource('dataset', 'Available dataset')] }
  })
  render(<HomeMarketPreview />)
  expect(await screen.findByRole('link', { name: 'Available dataset' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Show more' })).toBeTruthy()
})

it('shows loading and honest empty states without sample records', async () => {
  let finish: (value: unknown) => void = () => {}
  const pending = new Promise(resolve => { finish = resolve })
  vi.mocked(apiRequest).mockReturnValue(pending)
  render(<HomeMarketPreview />)
  expect(screen.getByText('Loading published models and datasets...')).toBeTruthy()
  finish({ results: [] })
  await screen.findByText('No public models or datasets have been published yet.')
  expect(screen.queryByRole('link', { name: 'View Model' })).toBeNull()
})
