'use client'

import * as React from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Copy, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { AuditLogJsonDiff } from './audit-log-json-diff'
import type { AuditLogEntry } from './types'

interface AuditLogDetailSheetProps {
  entry: AuditLogEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const actionBadgeConfig: Record<string, { variant: 'default' | 'destructive' | 'outline'; className: string }> = {
  create:   { variant: 'default',     className: 'bg-green-600 hover:bg-green-700' },
  update:   { variant: 'outline',     className: 'border-blue-500 text-blue-700' },
  delete:   { variant: 'destructive', className: '' },
  approve:  { variant: 'default',     className: 'bg-green-600 hover:bg-green-700' },
  reject:   { variant: 'destructive', className: '' },
  cancel:   { variant: 'destructive', className: '' },
  close:    { variant: 'outline',     className: 'border-purple-500 text-purple-700' },
  reopen:   { variant: 'outline',     className: 'border-orange-500 text-orange-700' },
  finalize: { variant: 'outline',     className: 'border-indigo-500 text-indigo-700' },
  forward:  { variant: 'outline',     className: 'border-cyan-500 text-cyan-700' },
  export:   { variant: 'outline',     className: 'border-cyan-500 text-cyan-700' },
  import:   { variant: 'outline',     className: 'border-teal-500 text-teal-700' },
}

function renderMetadata(
  metadata: unknown,
  noMetadataLabel: string
) {
  if (!metadata || typeof metadata !== 'object' || Object.keys(metadata as object).length === 0) {
    return <p className="text-sm text-muted-foreground">{noMetadataLabel}</p>
  }

  const entries = Object.entries(metadata as Record<string, unknown>)

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

export function AuditLogDetailSheet({ entry, open, onOpenChange }: AuditLogDetailSheetProps) {
  const t = useTranslations('auditLogs')
  const locale = useLocale()
  const [copied, setCopied] = React.useState(false)

  const formatDateTime = (dateStr: string | Date) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'full',
        timeStyle: 'medium',
      }).format(new Date(dateStr))
    } catch {
      return String(dateStr)
    }
  }

  const handleCopyId = async (id: string) => {
    await navigator.clipboard.writeText(id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!entry) return null

  const badgeConfig = actionBadgeConfig[entry.action] ?? { variant: 'outline' as const, className: '' }

  const changes = entry.changes as Record<string, unknown> | null | undefined
  const hasFieldDiffs = changes && typeof changes === 'object' && Object.keys(changes).length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('detail.title')}</SheetTitle>
          <SheetDescription>
            {entry.entityName ?? entry.entityId}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Event Info */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('detail.eventInfo')}
              </h4>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.action')}</span>
                  <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
                    {t(`actions.${entry.action}` as Parameters<typeof t>[0])}
                  </Badge>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.entityType')}</span>
                  <span className="text-sm font-medium">
                    {t(`entityTypes.${entry.entityType}` as Parameters<typeof t>[0])}
                  </span>
                </div>
                {entry.entityName && (
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.entityName')}</span>
                    <span className="text-sm font-medium">{entry.entityName}</span>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.entityId')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium font-mono text-xs">{entry.entityId}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleCopyId(entry.entityId)}
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* User Info */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('detail.userInfo')}
              </h4>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.user')}</span>
                  <div className="flex items-center gap-2">
                    {entry.user && (
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {entry.user.displayName?.charAt(0)?.toUpperCase() ?? '?'}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <span className="text-sm font-medium">
                      {entry.user?.displayName ?? t('system')}
                    </span>
                  </div>
                </div>
                {entry.userId && (
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.userId')}</span>
                    <span className="text-sm font-medium font-mono text-xs">{entry.userId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Request Info */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('detail.requestInfo')}
              </h4>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.ipAddress')}</span>
                  <span className="text-sm font-medium font-mono">
                    {entry.ipAddress ?? t('system')}
                  </span>
                </div>
                {entry.userAgent && (
                  <div className="flex justify-between py-1">
                    <span className="text-sm text-muted-foreground">{t('detail.userAgent')}</span>
                    <span className="text-sm font-medium truncate max-w-[250px]">
                      {entry.userAgent}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('detail.timestamps')}
              </h4>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between py-1">
                  <span className="text-sm text-muted-foreground">{t('detail.performedAt')}</span>
                  <span className="text-sm font-medium">{formatDateTime(entry.performedAt)}</span>
                </div>
              </div>
            </div>

            {/* Changes */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('detail.changesSection')}
              </h4>
              <div className="rounded-lg border p-4">
                {hasFieldDiffs ? (
                  <AuditLogJsonDiff changes={changes} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t('diff.noChanges')}</p>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {t('detail.metadataSection')}
              </h4>
              <div className="rounded-lg border p-4">
                {renderMetadata(entry.metadata, t('metadata.noMetadata'))}
              </div>
            </div>
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
