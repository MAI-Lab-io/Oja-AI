import React, { forwardRef, useRef, useState } from 'react'
import { sessionFetch } from '../lib/api'

type SavePicker = (options: { suggestedName: string }) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>

/** Choose a destination before fetching, without buffering large files in RAM. */
export const DownloadLink = forwardRef<HTMLAnchorElement, React.ComponentPropsWithoutRef<'a'> & { filename?: string }>(function DownloadLink({ href, filename = 'download.zip', onClick, children, ...props }, ref) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const active = useRef<AbortController | null>(null)
  const start = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    if (busy) { event.preventDefault(); return }
    const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker
    // Preserve native downloads on unsupported browsers and modified clicks.
    if (!picker || !href || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setBusy(true); setError(''); setSaved(false)
    const controller = new AbortController()
    active.current = controller
    let destination: WritableStream<Uint8Array> | undefined
    try {
      // Must happen directly from the click, before a request or other await.
      const handle = await picker.call(window, { suggestedName: filename.replace(/[<>:"/\\|?*]/g, '-') })
      destination = await handle.createWritable()
      const response = await sessionFetch(href, { signal: controller.signal })
      if (!response.ok || !response.body) throw new Error(`Unable to download this file (${response.status}). Please refresh and try again.`)
      await response.body.pipeTo(destination)
      setSaved(true)
    } catch (error) {
      controller.abort()
      try { await destination?.abort() } catch { /* pipeTo may already have aborted it. */ }
      if ((error as { name?: string } | null)?.name !== 'AbortError') setError(error instanceof Error ? error.message : 'Download failed. Please try again.')
    } finally { setBusy(false); active.current = null }
  }
  return <><a {...props} className={['catalog-download-link', props.className].filter(Boolean).join(' ')} ref={ref} href={href} aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={start}>{children}</a>{busy && <><span role="status" className="text-sm text-gray-600">Saving download...</span><button type="button" className="text-sm underline" onClick={() => active.current?.abort()}>Cancel download</button></>}{saved && <span role="status" className="text-sm text-gray-600">File saved.</span>}{error && <span role="alert" className="text-sm text-red-800">{error}</span>}</>
})
