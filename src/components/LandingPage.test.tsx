import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'
import { apiRequest } from '../lib/api'

vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }))
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: (entries: any[]) => void) {}
    observe() { this.callback([{ isIntersecting: true }]) }
    disconnect() {}
  })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('animates to the exact database counts without invented suffixes or percentages', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ models: 7, datasets: 3, published_versions: 12, contributors: 2 })
  await act(async () => { render(<LandingPage onLoginClick={() => {}} />) })
  act(() => { vi.advanceTimersByTime(2100) })
  expect(apiRequest).toHaveBeenCalledWith('/api/v1/statistics/')
  const preview = screen.getByRole('region', { name: 'Explore the market' })
  const hero = screen.getByRole('heading', { name: /Welcome to/ })
  const about = screen.getByRole('heading', { name: /What is/ })
  expect(hero.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(preview.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  for (const [label, value] of [['Public AI models', '7'], ['Public datasets', '3'], ['Published versions', '12'], ['Contributors', '2']]) {
    expect(screen.getByText(label).previousElementSibling?.textContent).toBe(value)
  }
  expect(screen.queryByText('Satisfaction')).toBeNull()
  expect(screen.queryByText('Institutions')).toBeNull()
  expect(screen.getByRole('link', { name: 'Home', exact: true }).getAttribute('href')).toBe('#home')
  const cta = within(screen.getByRole('region', { name: 'Get started with Oja AI' }))
  expect(cta.getByRole('heading', { name: 'Ready to evaluate your models?' })).toBeTruthy()
  expect(cta.getByRole('button', { name: 'Start Your Journey' })).toBeTruthy()
  expect(cta.getByRole('button', { name: 'Schedule Demo' })).toBeTruthy()
  expect(cta.queryByRole('button', { name: 'Go to Dashboard' })).toBeNull()
})

it('shows zero when the database reports an empty public catalog', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ models: 0, datasets: 0, published_versions: 0, contributors: 0 })
  const dashboard = vi.fn()
  const modelZoo = vi.fn()
  await act(async () => { render(<LandingPage onLoginClick={dashboard} onGetStarted={modelZoo} isSignedIn user={{ id: 'alice', email: 'alice@example.com', name: 'Alice' }} />) })
  expect(screen.getByText('Public AI models').previousElementSibling?.textContent).toBe('0')
  const cta = within(screen.getByRole('region', { name: 'Get started with Oja AI' }))
  expect(cta.getByRole('heading', { name: 'Ready to evaluate your models?' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: /Welcome to/ })).toBeTruthy()
  expect(screen.getByText(/The premier marketplace for AI models and datasets/)).toBeTruthy()
  expect(screen.queryByRole('heading', { name: /Welcome back/ })).toBeNull()
  fireEvent.click(cta.getByRole('button', { name: 'Go to Dashboard' }))
  fireEvent.click(cta.getByRole('button', { name: 'View Oja Models' }))
  expect(dashboard).toHaveBeenCalledOnce()
  expect(modelZoo).toHaveBeenCalledOnce()
  expect(cta.queryByRole('button', { name: 'Start Your Journey' })).toBeNull()
})

it('shows unavailable statistics rather than fabricated numbers when the API fails', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error('Unavailable'))
  await act(async () => { render(<LandingPage onLoginClick={() => {}} />) })
  expect(screen.getByRole('status').textContent).toBe('Platform statistics are temporarily unavailable.')
  expect(screen.getByText('Public AI models').previousElementSibling?.textContent).toBe('—')
})
