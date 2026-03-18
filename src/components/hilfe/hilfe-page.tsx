'use client'

import { useState, useMemo, useEffect, useCallback, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Search, ChevronLeft, ChevronRight, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface TocItem {
  id: string
  text: string
  level: number
}

interface HilfePageProps {
  content: string
}

/** Generate a URL-friendly slug from heading text */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-äöüß]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

/** Extract table of contents from markdown content */
function extractToc(markdown: string): TocItem[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm
  const items: TocItem[] = []
  let match

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1]!.length
    const text = match[2]!.trim()
    items.push({ id: slugify(text), text, level })
  }

  return items
}

/** Custom heading component that adds anchor IDs */
function createHeading(level: number) {
  function Heading({ children }: { children?: React.ReactNode }) {
    const text = extractTextFromChildren(children)
    const id = slugify(text)
    const className = "group scroll-mt-20"
    const anchor = (
      <a
        href={`#${id}`}
        className="ml-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        aria-label={`Link zu ${text}`}
      >
        #
      </a>
    )

    switch (level) {
      case 1: return <h1 id={id} className={className}>{children}{anchor}</h1>
      case 2: return <h2 id={id} className={className}>{children}{anchor}</h2>
      case 3: return <h3 id={id} className={className}>{children}{anchor}</h3>
      default: return <h4 id={id} className={className}>{children}{anchor}</h4>
    }
  }
  Heading.displayName = `Heading${level}`
  return Heading
}

/** Extract plain text from React children */
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return extractTextFromChildren((children as any).props.children)
  }
  return ''
}

export function HilfePage({ content }: HilfePageProps) {
  const [search, setSearch] = useState('')
  const [tocOpen, setTocOpen] = useState(true)
  const [activeId, setActiveId] = useState('')
  const [showScrollTop, setShowScrollTop] = useState(false)

  const toc = useMemo(() => extractToc(content), [content])

  // Filter ToC items by search
  const filteredToc = useMemo(() => {
    if (!search.trim()) return toc
    const q = search.toLowerCase()
    return toc.filter((item) => item.text.toLowerCase().includes(q))
  }, [toc, search])

  // Track active heading via IntersectionObserver
  useEffect(() => {
    const headings = document.querySelectorAll<HTMLElement>(
      '.hilfe-content h1[id], .hilfe-content h2[id], .hilfe-content h3[id]'
    )
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
            break
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    )

    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [content])

  // Show scroll-to-top button
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar / Table of Contents */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex flex-col border-r bg-background transition-all duration-300',
          tocOpen ? 'w-80' : 'w-0 overflow-hidden',
          'max-lg:hidden'
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="text-sm font-semibold text-foreground">Inhaltsverzeichnis</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setTocOpen(false)}
            aria-label="Inhaltsverzeichnis schließen"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen..."
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* ToC links */}
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Inhaltsverzeichnis">
          <ul className="space-y-0.5">
            {filteredToc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={cn(
                    'block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                    item.level === 1 && 'font-semibold',
                    item.level === 2 && 'pl-4',
                    item.level === 3 && 'pl-6 text-muted-foreground',
                    activeId === item.id && 'bg-accent text-accent-foreground font-medium'
                  )}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main content area */}
      <div
        className={cn(
          'flex-1 transition-all duration-300',
          tocOpen ? 'lg:ml-80' : 'lg:ml-0'
        )}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          {/* ToC toggle (desktop) */}
          {!tocOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex h-8 w-8"
              onClick={() => setTocOpen(true)}
              aria-label="Inhaltsverzeichnis öffnen"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}

          <span className="text-lg font-semibold">Terp Handbuch</span>
          <div className="flex-1" />

          {/* Mobile search */}
          <div className="relative max-w-xs flex-1 lg:hidden">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen..."
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <ThemeToggle />
        </header>

        {/* Mobile ToC (collapsible) */}
        <MobileToc
          items={filteredToc}
          activeId={activeId}
          search={search}
          onSearchChange={setSearch}
        />

        {/* Markdown content */}
        <main className="hilfe-content mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <MemoizedMarkdown content={content} />
        </main>
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 z-40 h-10 w-10 rounded-full shadow-lg"
          onClick={scrollToTop}
          aria-label="Nach oben scrollen"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
}

/** Memoized markdown renderer — prevents re-parsing 6000+ lines on every keystroke */
const markdownComponents = {
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  h4: createHeading(4),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-4 overflow-x-auto rounded-lg border">
      <table className="min-w-full divide-y divide-border text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-muted/50">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2 text-left font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-2 border-t border-border">{children}</td>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.startsWith('language-')
    if (isBlock) {
      return (
        <code className={cn('text-sm', className)}>
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono text-foreground">
        {children}
      </code>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-4 overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm">
      {children}
    </pre>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-4 hover:text-primary-hover"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-4 border-l-4 border-primary/30 pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-border" />,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-2 ml-6 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-2 ml-6 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-foreground">{children}</li>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-3 leading-7">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
}

const remarkPlugins = [remarkGfm]

const MemoizedMarkdown = memo(function MemoizedMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  )
})

/** Mobile-only expandable table of contents */
function MobileToc({
  items,
  activeId,
  search,
  onSearchChange,
}: {
  items: TocItem[]
  activeId: string
  search: string
  onSearchChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b lg:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
      >
        Inhaltsverzeichnis
        <ChevronRight
          className={cn('h-4 w-4 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div className="max-h-[50vh] overflow-y-auto border-t px-4 pb-4">
          <div className="relative my-2">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Suchen..."
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                    item.level === 1 && 'font-semibold',
                    item.level === 2 && 'pl-4',
                    item.level === 3 && 'pl-6 text-muted-foreground',
                    activeId === item.id && 'bg-accent font-medium'
                  )}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
