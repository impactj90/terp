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
}

interface ArticleSearchPopoverProps {
  value: string | null
  onSelect: (id: string, name: string, article?: ArticleSearchResult) => void
  placeholder?: string
}

/**
 * Reusable article search/autocomplete component.
 * Used in BOM, document positions (ORD_01), and purchase orders (WH_03).
 */
export function ArticleSearchPopover({
  value,
  onSelect,
  placeholder,
}: ArticleSearchPopoverProps) {
  const t = useTranslations('warehouseArticles')
  const resolvedPlaceholder = placeholder ?? t('articleSearchPlaceholder')
  const [query, setQuery] = React.useState('')
  const [showResults, setShowResults] = React.useState(false)
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

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => query.length >= 1 && setShowResults(true)}
          placeholder={resolvedPlaceholder}
          className="pl-8"
        />
      </div>
      {showResults && results && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {results.map((article: ArticleSearchResult) => (
            <button
              key={article.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
              onClick={() => {
                onSelect(article.id, `${article.number} — ${article.name}`, article)
                setQuery(article.number)
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
        </div>
      )}
      {showResults && query.length >= 1 && results && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
          {t('noArticleFound')}
        </div>
      )}
    </div>
  )
}
