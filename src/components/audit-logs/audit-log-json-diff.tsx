'use client'

import { useTranslations } from 'next-intl'

interface AuditLogJsonDiffProps {
  before: Record<string, unknown> | null | undefined
  after: Record<string, unknown> | null | undefined
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey))
    } else {
      result[fullKey] = value
    }
  }
  return result
}

export function AuditLogJsonDiff({ before, after }: AuditLogJsonDiffProps) {
  const t = useTranslations('auditLogs')

  if ((!before || Object.keys(before).length === 0) && (!after || Object.keys(after).length === 0)) {
    return <p className="text-sm text-muted-foreground">{t('diff.noChanges')}</p>
  }

  const flatBefore = before ? flattenObject(before) : {}
  const flatAfter = after ? flattenObject(after) : {}
  const allKeys = [...new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)])]

  const changedKeys = allKeys.filter((key) => {
    const oldVal = JSON.stringify(flatBefore[key] ?? null)
    const newVal = JSON.stringify(flatAfter[key] ?? null)
    return oldVal !== newVal
  })

  if (changedKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('diff.noChanges')}</p>
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground border-b pb-1">
        <span>{t('diff.field')}</span>
        <span>{t('diff.before')}</span>
        <span>{t('diff.after')}</span>
      </div>
      {changedKeys.map((key) => {
        const oldVal = flatBefore[key]
        const newVal = flatAfter[key]
        const oldStr = oldVal !== undefined ? JSON.stringify(oldVal) : '-'
        const newStr = newVal !== undefined ? JSON.stringify(newVal) : '-'
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
