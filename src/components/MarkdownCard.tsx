import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Uploaded cards are untrusted Markdown. Keep raw HTML disabled and the default URL sanitizer. */
export function MarkdownCard({ children }: { children: string }) {
  return <div className="catalog-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    h1: ({ children }) => <h3>{children}</h3>,
    h2: ({ children }) => <h4>{children}</h4>,
    h3: ({ children }) => <h5>{children}</h5>,
    table: ({ children }) => <div className="catalog-markdown-table"><table>{children}</table></div>,
    a: ({ href, children }) => <a href={href} rel="noopener noreferrer">{children}</a>,
    img: ({ src, alt }) => <img src={src} alt={alt || ''} loading="lazy" referrerPolicy="no-referrer" />,
  }}>{children}</ReactMarkdown></div>
}
