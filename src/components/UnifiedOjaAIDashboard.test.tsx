import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnifiedOjaAIDashboard } from './UnifiedOjaAIDashboard'

vi.mock('./RepositoryWorkspace', () => ({ RepositoryWorkspace: ({ kind }: { kind: string }) => <div>{kind} workspace</div> }))
vi.mock('./RealMLEvaluationDashboard', () => ({ RealMLEvaluationDashboard: () => null }))
vi.mock('./ModelComparisonDashboard', () => ({ ModelComparisonDashboard: () => null }))
vi.mock('./PublicModelZoo', () => ({ PublicModelZoo: () => null }))
vi.mock('./PublicDataZoo', () => ({ PublicDataZoo: () => null }))

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })

it('opens dataset management directly and retains the selected upload tab after refresh', async () => {
  window.history.replaceState({}, '', '/dashboard?tab=upload-data')
  const user = userEvent.setup()
  const props = { user: { id: 'alice', email: 'alice@example.com' } }
  const first = render(<UnifiedOjaAIDashboard {...props} />)
  expect(screen.getByText('dataset workspace')).toBeTruthy()
  expect(screen.queryByText('model workspace')).toBeNull()
  expect(screen.getByRole('tab', { name: 'Upload Data' }).getAttribute('aria-selected')).toBe('true')
  await user.click(screen.getByRole('tab', { name: 'Upload Model' }))
  expect(new URLSearchParams(window.location.search).get('tab')).toBe('upload-model')
  first.unmount()
  render(<UnifiedOjaAIDashboard {...props} />)
  expect(screen.getByText('model workspace')).toBeTruthy()
})

it('falls back to model uploads for an unknown tab', () => {
  window.history.replaceState({}, '', '/dashboard?tab=unknown')
  render(<UnifiedOjaAIDashboard user={{ id: 'alice', email: 'alice@example.com' }} />)
  expect(screen.getByText('model workspace')).toBeTruthy()
})
