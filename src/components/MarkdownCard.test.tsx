import React from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MarkdownCard } from './MarkdownCard'

afterEach(cleanup)

it('renders documentation headings, emphasis, lists, code and Markdown tables', () => {
  render(<MarkdownCard>{'# Dataset overview\n\n**Synthetic** records.\n\n- train\n- test\n\n```python\nload_dataset()\n```\n\n| Feature | Type |\n| --- | --- |\n| age | integer |'}</MarkdownCard>)
  expect(screen.getByRole('heading', { name: 'Dataset overview' })).toBeTruthy()
  expect(screen.getByText('Synthetic').tagName).toBe('STRONG')
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText('load_dataset()').tagName).toBe('CODE')
  expect(screen.getByRole('table')).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'age' })).toBeTruthy()
})

it('does not render uploaded HTML or executable link URLs', () => {
  const { container } = render(<MarkdownCard>{'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[Unsafe](javascript:alert%281%29)\n\n[Documentation](https://example.com)'}</MarkdownCard>)
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('[onerror]')).toBeNull()
  expect(screen.getByText('Unsafe').getAttribute('href') || '').not.toContain('javascript:')
  expect(screen.getByRole('link', { name: 'Documentation' }).getAttribute('href')).toBe('https://example.com')
})
