'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  useDsgvoRules,
  useUpdateDsgvoRule,
  useDsgvoPreview,
} from '@/hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Check, Pencil, AlertTriangle, Loader2 } from 'lucide-react'

const LEGAL_MINIMUM_MONTHS: Record<string, number> = {
  PERSONNEL_FILE: 120,
  STOCK_MOVEMENTS: 120,
  MONTHLY_VALUES: 60,
}

const ANONYMIZABLE_TYPES = new Set(['ABSENCES', 'STOCK_MOVEMENTS'])

interface EditingState {
  dataType: string
  retentionMonths: number
  action: 'DELETE' | 'ANONYMIZE'
  isActive: boolean
  description: string | null
}

export function RetentionRulesTable() {
  const t = useTranslations('dsgvo')
  const tc = useTranslations('common')
  const { data: rules, isLoading: rulesLoading } = useDsgvoRules()
  const { data: preview, isLoading: previewLoading } = useDsgvoPreview()
  const updateRule = useUpdateDsgvoRule()

  const [editing, setEditing] = React.useState<EditingState | null>(null)

  const previewMap = React.useMemo(() => {
    const map = new Map<string, number>()
    if (preview) {
      for (const p of preview) {
        map.set(p.dataType, p.count)
      }
    }
    return map
  }, [preview])

  function startEdit(rule: {
    dataType: string
    retentionMonths: number
    action: string
    isActive: boolean
    description: string | null
  }) {
    setEditing({
      dataType: rule.dataType,
      retentionMonths: rule.retentionMonths,
      action: rule.action as 'DELETE' | 'ANONYMIZE',
      isActive: rule.isActive,
      description: rule.description,
    })
  }

  function cancelEdit() {
    setEditing(null)
  }

  async function saveEdit() {
    if (!editing) return
    try {
      await updateRule.mutateAsync({
        dataType: editing.dataType,
        retentionMonths: editing.retentionMonths,
        action: editing.action,
        isActive: editing.isActive,
        description: editing.description,
      })
      setEditing(null)
    } catch {
      // Error handled by mutation
    }
  }

  if (rulesLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('rules.dataType')}</TableHead>
            <TableHead className="w-[140px]">{t('rules.retentionMonths')}</TableHead>
            <TableHead className="w-[160px]">{t('rules.action')}</TableHead>
            <TableHead className="w-[80px]">{t('rules.active')}</TableHead>
            <TableHead className="w-[120px] text-right">{t('rules.affectedRecords')}</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules?.map((rule) => {
            const isEditing = editing?.dataType === rule.dataType
            const legalMin = LEGAL_MINIMUM_MONTHS[rule.dataType]
            const currentMonths = isEditing
              ? editing.retentionMonths
              : rule.retentionMonths
            const hasLegalWarning = legalMin && currentMonths < legalMin

            return (
              <TableRow key={rule.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {t(`dataTypes.${rule.dataType}` as Parameters<typeof t>[0])}
                    </span>
                    {hasLegalWarning && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {t('rules.legalWarning', {
                          months: legalMin,
                          years: legalMin / 12,
                        })}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Input
                      type="number"
                      min={6}
                      value={editing.retentionMonths}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          retentionMonths: parseInt(e.target.value, 10) || 6,
                        })
                      }
                      className="w-[100px]"
                    />
                  ) : (
                    <span>{rule.retentionMonths}</span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Select
                      value={editing.action}
                      onValueChange={(val) =>
                        setEditing({ ...editing, action: val as 'DELETE' | 'ANONYMIZE' })
                      }
                      disabled={!ANONYMIZABLE_TYPES.has(rule.dataType)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DELETE">{t('actions.DELETE')}</SelectItem>
                        {ANONYMIZABLE_TYPES.has(rule.dataType) && (
                          <SelectItem value="ANONYMIZE">
                            {t('actions.ANONYMIZE')}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={rule.action === 'DELETE' ? 'destructive' : 'secondary'}>
                      {t(`actions.${rule.action}` as Parameters<typeof t>[0])}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <Switch
                      checked={editing.isActive}
                      onCheckedChange={(val) =>
                        setEditing({ ...editing, isActive: val })
                      }
                    />
                  ) : (
                    <Switch checked={rule.isActive} disabled />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {previewLoading ? (
                    <Skeleton className="h-4 w-8 ml-auto" />
                  ) : (
                    <span className={previewMap.get(rule.dataType) ? 'font-medium' : 'text-muted-foreground'}>
                      {previewMap.get(rule.dataType) ?? '-'}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <div className="flex gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            onClick={saveEdit}
                            disabled={updateRule.isPending}
                          >
                            {updateRule.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tc('save')}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                            disabled={updateRule.isPending}
                          >
                            &times;
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tc('cancel')}</TooltipContent>
                      </Tooltip>
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(rule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{tc('edit')}</TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
