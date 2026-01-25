import * as React from 'react'
import { cn } from '@/lib/utils'

interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns (responsive object or single value) */
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12
  /** Gap between items */
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12
}

const colClasses: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
}

const gapClasses: Record<number, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
}

const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ cols = 1, gap = 4, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('grid', colClasses[cols], gapClasses[gap], className)}
        {...props}
      />
    )
  }
)
Grid.displayName = 'Grid'

// GridItem for spanning columns
interface GridItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns to span */
  span?: 1 | 2 | 3 | 4 | 5 | 6 | 12 | 'full'
}

const spanClasses: Record<string | number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  12: 'col-span-12',
  full: 'col-span-full',
}

const GridItem = React.forwardRef<HTMLDivElement, GridItemProps>(
  ({ span = 1, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(spanClasses[span], className)} {...props} />
    )
  }
)
GridItem.displayName = 'GridItem'

export { Grid, GridItem }
export type { GridProps, GridItemProps }
