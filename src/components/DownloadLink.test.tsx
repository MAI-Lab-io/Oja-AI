import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DownloadLink } from './DownloadLink'
import { sessionFetch } from '../lib/api'

vi.mock('../lib/api', () => ({ sessionFetch: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks(); delete (window as any).showSaveFilePicker })

it('does not send any download request if the save dialog is cancelled', async () => {
  ;(window as any).showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
  render(<DownloadLink href="/api/v1/releases/version/download/">Download Model</DownloadLink>)
  await userEvent.click(screen.getByRole('link', { name: 'Download Model' }))
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  expect(sessionFetch).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('waits for save selection and streams into the chosen file before reporting success', async () => {
  let choose: (value: any) => void = () => {}
  ;(window as any).showSaveFilePicker = vi.fn().mockReturnValue(new Promise(resolve => { choose = resolve }))
  const destination = { abort: vi.fn() }
  const pipeTo = vi.fn().mockResolvedValue(undefined)
  vi.mocked(sessionFetch).mockResolvedValue({ ok: true, body: { pipeTo } } as any)
  render(<DownloadLink href="/api/v1/releases/version/download/" filename="model-1.0.zip">Download Model</DownloadLink>)
  await userEvent.click(screen.getByRole('link', { name: 'Download Model' }))
  expect(sessionFetch).not.toHaveBeenCalled()
  choose({ createWritable: vi.fn().mockResolvedValue(destination) })
  await screen.findByText('File saved.')
  expect(pipeTo).toHaveBeenCalledWith(destination)
  expect(sessionFetch).toHaveBeenCalledWith('/api/v1/releases/version/download/', { signal: expect.any(AbortSignal) })
})

it('aborts a failed write and does not claim that the file was saved', async () => {
  const destination = { abort: vi.fn().mockResolvedValue(undefined) }
  ;(window as any).showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable: vi.fn().mockResolvedValue(destination) })
  vi.mocked(sessionFetch).mockResolvedValue({ ok: true, body: { pipeTo: vi.fn().mockRejectedValue(new Error('Disk full')) } } as any)
  render(<DownloadLink href="/api/v1/releases/version/download/">Download Dataset</DownloadLink>)
  await userEvent.click(screen.getByRole('link', { name: 'Download Dataset' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Disk full')
  expect(destination.abort).toHaveBeenCalled()
  expect((vi.mocked(sessionFetch).mock.calls[0][1]!.signal as AbortSignal).aborted).toBe(true)
  expect(screen.queryByText('File saved.')).toBeNull()
})
