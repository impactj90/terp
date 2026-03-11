'use client'

import { useEffect } from 'react'

/**
 * Global error boundary — catches errors at the root level, outside providers.
 * Must render its own <html> and <body> since it replaces the entire root layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-center space-y-4 max-w-md">
            <h1 className="text-2xl font-bold tracking-tight">
              Something went wrong
            </h1>
            <p className="text-muted-foreground">
              An unexpected error occurred. Please try reloading the page.
            </p>
            <button
              onClick={reset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
