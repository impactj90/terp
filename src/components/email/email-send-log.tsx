'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useEmailSendLog } from '@/hooks/use-email'

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent: 'default',
  pending: 'secondary',
  retrying: 'outline',
  failed: 'destructive',
}

const STATUS_LABELS: Record<string, string> = {
  sent: 'Gesendet',
  pending: 'Ausstehend',
  retrying: 'Wird wiederholt',
  failed: 'Fehlgeschlagen',
}

interface EmailSendLogProps {
  documentId: string
}

export function EmailSendLog({ documentId }: EmailSendLogProps) {
  const t = useTranslations('emailCompose')
  const [expanded, setExpanded] = React.useState(false)
  const { data, isLoading } = useEmailSendLog(documentId)

  if (isLoading) return null

  if (!data || data.total === 0) return null

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 px-0 text-muted-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        {t('sendLog')} ({data.total})
      </Button>

      {expanded && (
        <div className="space-y-2 pl-1">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            data.items.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 text-sm border-b pb-2"
              >
                <Badge variant={STATUS_VARIANTS[entry.status] ?? 'secondary'}>
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </Badge>
                <span className="text-muted-foreground">
                  {entry.toEmail}
                </span>
                <span className="text-muted-foreground ml-auto">
                  {entry.sentAt
                    ? new Date(entry.sentAt).toLocaleString('de-DE')
                    : new Date(entry.createdAt).toLocaleString('de-DE')}
                </span>
                {entry.errorMessage && (
                  <span className="text-destructive text-xs truncate max-w-[200px]">
                    {entry.errorMessage}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
