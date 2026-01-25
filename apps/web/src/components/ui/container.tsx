import * as React from 'react'
import { cn } from '@/lib/utils'

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum width variant */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /** Center the container */
  center?: boolean
  /** Add horizontal padding */
  padding?: boolean
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-screen-sm',   /* 640px */
  md: 'max-w-screen-md',   /* 768px */
  lg: 'max-w-screen-lg',   /* 1024px */
  xl: 'max-w-screen-xl',   /* 1280px */
  '2xl': 'max-w-screen-2xl', /* 1536px */
  full: 'max-w-full',
}

const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  (
    {
      size = 'xl',
      center = true,
      padding = true,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'w-full',
          sizeClasses[size],
          center && 'mx-auto',
          padding && 'px-4 sm:px-6 lg:px-8',
          className
        )}
        {...props}
      />
    )
  }
)
Container.displayName = 'Container'

export { Container }
export type { ContainerProps }
