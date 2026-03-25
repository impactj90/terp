'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { useWhArticleSearch } from '@/hooks'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

export interface ArticleSearchResult {
  id: string
  number: string
  name: string
  unit: string
  sellPrice: number | null
  buyPrice: number | null
  vatRate: number
  currentStock: number
  minStock: number | null
}

interface ArticleSearchPopoverProps {
  value: string | null
  onSelect: (id: string, name: string, article?: ArticleSearchResult) => void
  onFreeTextCommit?: (text: string) => void
  placeholder?: string
}

/**
 * Reusable article search/autocomplete component.
 * Used in BOM, document positions (ORD_01), and purchase orders (WH_03).
 *
 * When `onFreeTextCommit` is provided, the input also allows free text entry:
 * - Selecting an article calls `onSelect` (ARTICLE mode)
 * - Typing text and pressing Enter/blurring calls `onFreeTextCommit` (FREETEXT mode)
 */
export function ArticleSearchPopover({
  value,
  onSelect,
  onFreeTextCommit,
  placeholder,
}: ArticleSearchPopoverProps) {
  const t = useTranslations('warehouseArticles')
  const resolvedPlaceholder = placeholder ?? t('articleSearchPlaceholder')
  const [query, setQuery] = React.useState('')
  const [showResults, setShowResults] = React.useState(false)
  const [selectedArticle, setSelectedArticle] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const { data: results } = useWhArticleSearch(query)

  // Close on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleBlur = () => {
    if (!onFreeTextCommit) {
      setShowResults(false)
      return
    }
    // Delay to let mousedown on dropdown items fire first
    setTimeout(() => {
      setShowResults(false)
      if (query.trim() && !selectedArticle) {
        onFreeTextCommit(query.trim())
      }
    }, 150)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onFreeTextCommit && query.trim() && !selectedArticle) {
      e.preventDefault()
      setShowResults(false)
      onFreeTextCommit(query.trim())
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelectedArticle(false)
            setShowResults(true)
          }}
          onFocus={() => query.length >= 1 && setShowResults(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
          className="pl-8"
        />
      </div>
      {showResults && query.length >= 1 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {results && results.length > 0 && results.map((article: ArticleSearchResult) => (
            <button
              key={article.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(article.id, `${article.number} — ${article.name}`, article)
                setQuery(article.number)
                setSelectedArticle(true)
                setShowResults(false)
              }}
            >
              <span>
                <span className="font-mono text-xs mr-2">{article.number}</span>
                {article.name}
              </span>
              <span className="text-muted-foreground text-xs">{article.unit}</span>
            </button>
          ))}
          {onFreeTextCommit && query.trim() && (
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 border-t text-muted-foreground"
              onMouseDown={(e) => {
                e.preventDefault()
                setShowResults(false)
                onFreeTextCommit(query.trim())
              }}
            >
              <span className="text-xs font-medium">Freitext:</span>
              <span className="truncate">{query}</span>
            </button>
          )}
          {(!results || results.length === 0) && !onFreeTextCommit && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {t('noArticleFound')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
