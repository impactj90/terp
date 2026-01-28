import { AlertCircle, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface DailyError {
  id: string
  error_type: string
  message: string
  severity?: 'warning' | 'error'
}

interface ErrorBadgeProps {
  errors?: DailyError[] | null
  className?: string
}

/**
 * Display error/warning badge for days with issues.
 */
export function ErrorBadge({ errors, className }: ErrorBadgeProps) {
  if (!errors || errors.length === 0) return null

  const hasErrors = errors.some(e => e.severity === 'error' || !e.severity)
  const Icon = hasErrors ? AlertCircle : AlertTriangle

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={hasErrors ? 'destructive' : 'secondary'}
          className={cn('gap-1 cursor-help', className)}
        >
          <Icon className="h-3 w-3" />
          {errors.length}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          {errors.map((error, index) => (
            <div
              key={error.id ?? `${error.error_type}-${error.message}-${index}`}
              className="flex items-start gap-2 text-xs"
            >
              {error.severity === 'warning' ? (
                <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
              )}
              <span>{error.message}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
