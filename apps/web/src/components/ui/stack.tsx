import * as React from 'react'
import { cn } from '@/lib/utils'

interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Direction of stack */
  direction?: 'row' | 'column'
  /** Gap between items (Tailwind spacing scale) */
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12
  /** Horizontal alignment */
  align?: 'start' | 'center' | 'end' | 'stretch'
  /** Vertical alignment */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
  /** Whether items should wrap */
  wrap?: boolean
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

const alignClasses: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
}

const justifyClasses: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
}

const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  (
    {
      direction = 'column',
      gap = 4,
      align = 'stretch',
      justify = 'start',
      wrap = false,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          direction === 'row' ? 'flex-row' : 'flex-col',
          gapClasses[gap],
          alignClasses[align],
          justifyClasses[justify],
          wrap && 'flex-wrap',
          className
        )}
        {...props}
      />
    )
  }
)
Stack.displayName = 'Stack'

// Convenience components
const HStack = React.forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="row" {...props} />
)
HStack.displayName = 'HStack'

const VStack = React.forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="column" {...props} />
)
VStack.displayName = 'VStack'

export { Stack, HStack, VStack }
export type { StackProps }
