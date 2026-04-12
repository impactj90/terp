'use client'

import * as React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

interface PaginationProps {
  /** Current page (1-indexed) */
  page: number
  /** Total number of pages */
  totalPages: number
  /** Total number of items */
  total: number
  /** Items per page */
  limit: number
  /** Callback when page changes */
  onPageChange: (page: number) => void
  /** Callback when limit changes */
  onLimitChange: (limit: number) => void
  /** Available page sizes */
  pageSizes?: number[]
  /** Whether pagination is disabled */
  disabled?: boolean
  /** Additional class name */
  className?: string
}

/**
 * Pagination controls with page navigation and page size selector.
 *
 * @example
 * ```tsx
 * <Pagination
 *   page={1}
 *   totalPages={10}
 *   total={100}
 *   limit={10}
 *   onPageChange={setPage}
 *   onLimitChange={setLimit}
 * />
 * ```
 */
export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  pageSizes = [10, 20, 50, 100],
  disabled = false,
  className,
}: PaginationProps) {
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1
  const endItem = Math.min(page * limit, total)

  const canGoPrevious = page > 1
  const canGoNext = page < totalPages

  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      {/* Results count — full on sm+, compact on mobile */}
      <p className="hidden text-sm text-muted-foreground sm:block">
        {total === 0 ? (
          'No results'
        ) : (
          <>
            Showing <span className="font-medium">{startItem}</span> to{' '}
            <span className="font-medium">{endItem}</span> of{' '}
            <span className="font-medium">{total}</span> results
          </>
        )}
      </p>
      <p className="text-sm text-muted-foreground sm:hidden">
        {total === 0 ? (
          '–'
        ) : (
          <>
            <span className="font-medium">{startItem}</span>
            –
            <span className="font-medium">{endItem}</span>
            {' / '}
            <span className="font-medium">{total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-4">
        {/* Page size selector — hidden on mobile */}
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Rows per page
          </span>
          <Select
            value={String(limit)}
            onValueChange={(value) => onLimitChange(Number(value))}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={String(limit)} />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          {/* First page — hidden on mobile */}
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden sm:inline-flex"
            onClick={() => onPageChange(1)}
            disabled={disabled || !canGoPrevious}
          >
            <ChevronsLeft className="h-4 w-4" />
            <span className="sr-only">First page</span>
          </Button>

          {/* Previous page */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || !canGoPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous page</span>
          </Button>

          {/* Page indicator — compact on mobile */}
          <span className="hidden px-3 text-sm text-muted-foreground whitespace-nowrap sm:inline">
            Page {page} of {totalPages || 1}
          </span>
          <span className="px-2 text-sm text-muted-foreground whitespace-nowrap sm:hidden">
            {page}/{totalPages || 1}
          </span>

          {/* Next page */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || !canGoNext}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next page</span>
          </Button>

          {/* Last page — hidden on mobile */}
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden sm:inline-flex"
            onClick={() => onPageChange(totalPages)}
            disabled={disabled || !canGoNext}
          >
            <ChevronsRight className="h-4 w-4" />
            <span className="sr-only">Last page</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
