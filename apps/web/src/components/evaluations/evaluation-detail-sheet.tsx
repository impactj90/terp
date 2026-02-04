'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { components } from '@/lib/api/types'

type DetailEntry =
  | { type: 'log'; entry: components['schemas']['EvaluationLogEntry'] }
  | { type: 'workflow'; entry: components['schemas']['EvaluationWorkflowEntry'] }

interface EvaluationDetailSheetProps {
  entry: DetailEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ActionType = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'close' | 'reopen'

const actionBadgeConfig: Record<ActionType, { variant: 'default' | 'destructive' | 'outline'; className: string }> = {
  create: { variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  update: { variant: 'outline', className: 'border-blue-500 text-blue-700' },
  delete: { variant: 'destructive', className: '' },
  approve: { variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  reject: { variant: 'destructive', className: '' },
  close: { variant: 'outline', className: 'border-purple-500 text-purple-700' },
  reopen: { variant: 'outline', className: 'border-orange-500 text-orange-700' },
}

/**
 * Render changes object with before/after diff if structured,
 * or as raw JSON fallback.
 */
function renderChanges(
  changes: Record<string, never> | null | undefined,
  noChangesLabel: string,
  beforeLabel: string,
  afterLabel: string
) {
  if (!changes || Object.keys(changes).length === 0) {
    return <p className="text-sm text-muted-foreground">{noChangesLabel}</p>
  }

  // Check if changes has 'before' and 'after' keys for diff rendering
  const changesObj = changes as Record<string, unknown>
  const before = changesObj['before'] as Record<string, unknown> | undefined
  const after = changesObj['after'] as Record<string, unknown> | undefined

  if (before && typeof before === 'object' && after && typeof after === 'object') {
    const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    const changedKeys = allKeys.filter((key) => {
      const oldVal = JSON.stringify(before[key] ?? null)
      const newVal = JSON.stringify(after[key] ?? null)
      return oldVal !== newVal
    })

    if (changedKeys.length === 0) {
      return <p className="text-sm text-muted-foreground">{noChangesLabel}</p>
    }

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground border-b pb-1">
          <span>Field</span>
          <span>{beforeLabel}</span>
          <span>{afterLabel}</span>
        </div>
        {changedKeys.map((key) => {
          const oldVal = JSON.stringify(before[key] ?? null)
          const newVal = JSON.stringify(after[key] ?? null)
          return (
            <div key={key} className="grid grid-cols-3 gap-2 text-sm font-mono">
              <span className="text-muted-foreground truncate">{key}</span>
              <span className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 px-1 rounded truncate">
                {oldVal}
              </span>
              <span className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 px-1 rounded truncate">
                {newVal}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // Fallback: raw JSON display
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap break-words overflow-auto max-h-64 bg-muted p-2 rounded">
      {JSON.stringify(changes, null, 2)}
    </pre>
  )
}

/**
 * Render metadata as formatted key-value pairs.
 */
function renderMetadata(
  metadata: Record<string, never> | null | undefined,
  noMetadataLabel: string
) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return <p className="text-sm text-muted-foreground">{noMetadataLabel}</p>
  }

  const metadataObj = metadata as Record<string, unknown>
  const entries = Object.entries(metadataObj)

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex justify-between py-1 text-sm">
          <span className="text-muted-foreground font-mono">{key}</span>
          <span className="font-medium font-mono text-xs truncate max-w-[250px]">
            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}
          </span>
        </div>
      ))}
    </div>
  )
}

export function EvaluationDetailSheet({ entry, open, onOpenChange }: EvaluationDetailSheetProps) {
  const t = useTranslations('evaluations')
  const locale = useLocale()

  const formatDateTime = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'full',
        timeStyle: 'medium',
      }).format(new Date(dateStr))
    } catch {
      return dateStr
    }
  }

  if (!entry) return null

  const isLog = entry.type === 'log'
  const item = entry.entry
  const action = item.action as ActionType
  const badgeConfig = actionBadgeConfig[action] ?? { variant: 'outline' as const, className: '' }
  const sheetTitle = isLog ? t('detail.logTitle') : t('detail.workflowTitle')

  // Extract changes/metadata
  const changes = isLog ? (item as components['schemas']['EvaluationLogEntry']).changes : null
  const metadata = !isLog ? (item as components['schemas']['EvaluationWorkflowEntry']).metadata : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription>
            {item.entity_name ?? item.entity_id}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('detail.title')}
              </h4>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.timestamp')}</span>
                  <span className="text-sm font-medium">{formatDateTime(item.performed_at)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.user')}</span>
                  <span className="text-sm font-medium">{item.user?.display_name ?? '-'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.action')}</span>
                  <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
                    {t(`actions.${action}` as Parameters<typeof t>[0])}
                  </Badge>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.entityType')}</span>
                  <span className="text-sm font-medium">
                    {t(`entityTypes.${item.entity_type}` as Parameters<typeof t>[0])}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.entityId')}</span>
                  <span className="text-sm font-medium font-mono text-xs">{item.entity_id}</span>
                </div>
                {item.entity_name && (
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.entityName')}</span>
                    <span className="text-sm font-medium">{item.entity_name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Changes section (log entries only) */}
            {isLog && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.changesSection')}
                </h4>
                <div className="rounded-lg border p-4">
                  {renderChanges(
                    changes,
                    t('detail.noChanges'),
                    t('detail.before'),
                    t('detail.after')
                  )}
                </div>
              </div>
            )}

            {/* Metadata section (workflow entries only) */}
            {!isLog && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t('detail.metadataSection')}
                </h4>
                <div className="rounded-lg border p-4">
                  {renderMetadata(metadata, t('detail.noMetadata'))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            {t('detail.close')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
