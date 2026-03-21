'use client'

import { useTranslations } from 'next-intl'

interface AuditLogJsonDiffProps {
  changes: Record<string, unknown>
}

export function AuditLogJsonDiff({ changes }: AuditLogJsonDiffProps) {
  const t = useTranslations('auditLogs')

  const entries = Object.entries(changes)

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('diff.noChanges')}</p>
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground border-b pb-1">
        <span>{t('diff.field')}</span>
        <span>{t('diff.before')}</span>
        <span>{t('diff.after')}</span>
      </div>
      {entries.map(([key, value]) => {
        const diff = value as { old?: unknown; new?: unknown } | unknown
        let oldStr: string
        let newStr: string

        if (diff && typeof diff === 'object' && 'old' in diff && 'new' in diff) {
          oldStr = formatValue((diff as { old: unknown }).old)
          newStr = formatValue((diff as { new: unknown }).new)
        } else {
          oldStr = '-'
          newStr = formatValue(diff)
        }

        return (
          <div key={key} className="grid grid-cols-3 gap-2 text-sm font-mono">
            <span className="text-muted-foreground truncate">{key}</span>
            <span className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 px-1 rounded truncate">
              {oldStr}
            </span>
            <span className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 px-1 rounded truncate">
              {newStr}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'string') return val || '-'
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'number') return String(val)
  return JSON.stringify(val)
}
