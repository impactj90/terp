'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Check, ChevronRight, ClipboardList, FileText, Wrench, PackageMinus,
  PackageOpen, ArrowRight, RotateCcw, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ArticleSearchPopover } from './article-search-popover'
import type { ArticleSearchResult } from './article-search-popover'
import { WithdrawalArticleRow } from './withdrawal-article-row'
import type { WithdrawalArticleInfo } from './withdrawal-article-row'
import {
  useCreateBatchWhWithdrawal,
} from '@/hooks/use-wh-withdrawals'

type Step = 1 | 2 | 3
type ReferenceType = 'ORDER' | 'DOCUMENT' | 'MACHINE' | 'NONE'

interface WithdrawalItem {
  articleId: string
  article: WithdrawalArticleInfo
  quantity: number
}

interface WithdrawalState {
  step: Step
  referenceType: ReferenceType
  referenceId: string
  machineId: string
  items: WithdrawalItem[]
  notes: string
}

const STEPS = [
  { num: 1, key: 'stepReference' },
  { num: 2, key: 'stepArticles' },
  { num: 3, key: 'stepConfirm' },
] as const

const REF_TYPE_CONFIG: Array<{
  value: ReferenceType
  labelKey: string
  descKey: string
  icon: React.ElementType
}> = [
  {
    value: 'ORDER',
    labelKey: 'refTypeOrder',
    descKey: 'refTypeOrderDesc',
    icon: ClipboardList,
  },
  {
    value: 'DOCUMENT',
    labelKey: 'refTypeDocument',
    descKey: 'refTypeDocumentDesc',
    icon: FileText,
  },
  {
    value: 'MACHINE',
    labelKey: 'refTypeMachine',
    descKey: 'refTypeMachineDesc',
    icon: Wrench,
  },
  {
    value: 'NONE',
    labelKey: 'refTypeNone',
    descKey: 'refTypeNoneDesc',
    icon: PackageMinus,
  },
]

const initialState: WithdrawalState = {
  step: 1,
  referenceType: 'NONE',
  referenceId: '',
  machineId: '',
  items: [],
  notes: '',
}

export function WithdrawalTerminal() {
  const t = useTranslations('warehouseWithdrawals')

  const [state, setState] = React.useState<WithdrawalState>(initialState)
  const batchMutation = useCreateBatchWhWithdrawal()

  const setStep = (step: Step) => setState((s) => ({ ...s, step }))

  const selectReferenceType = (referenceType: ReferenceType) => {
    setState((s) => ({ ...s, referenceType, referenceId: '', machineId: '' }))
  }

  const canProceedFromStep1 = () => {
    if (state.referenceType === 'NONE') return true
    if (state.referenceType === 'MACHINE') return state.machineId.trim().length > 0
    return state.referenceId.trim().length > 0
  }

  const canProceedFromStep2 = () => {
    return state.items.length > 0 && state.items.every(
      (item) => item.quantity > 0 && item.quantity <= item.article.currentStock
    )
  }

  const addArticle = (_id: string, _name: string, article?: ArticleSearchResult) => {
    if (!article) return
    if (state.items.some((i) => i.articleId === article.id)) return

    const articleInfo: WithdrawalArticleInfo = {
      id: article.id,
      number: article.number,
      name: article.name,
      unit: article.unit,
      currentStock: article.currentStock,
      minStock: article.minStock,
    }

    setState((s) => ({
      ...s,
      items: [...s.items, { articleId: article.id, article: articleInfo, quantity: 1 }],
    }))
  }

  const updateQuantity = (articleId: string, quantity: number) => {
    setState((s) => ({
      ...s,
      items: s.items.map((item) =>
        item.articleId === articleId ? { ...item, quantity } : item
      ),
    }))
  }

  const removeArticle = (articleId: string) => {
    setState((s) => ({
      ...s,
      items: s.items.filter((item) => item.articleId !== articleId),
    }))
  }

  const handleWithdraw = async () => {
    if (state.items.length === 0) return

    try {
      await batchMutation.mutateAsync({
        referenceType: state.referenceType,
        referenceId: state.referenceType !== 'NONE' && state.referenceType !== 'MACHINE'
          ? state.referenceId || undefined
          : undefined,
        machineId: state.referenceType === 'MACHINE' ? state.machineId || undefined : undefined,
        items: state.items.map((item) => ({
          articleId: item.articleId,
          quantity: item.quantity,
        })),
        notes: state.notes || undefined,
      })

      if (state.items.length === 1) {
        toast.success(t('toastWithdrawn'))
      } else {
        toast.success(t('toastWithdrawnBatch', { count: state.items.length }))
      }

      setState(initialState)
    } catch {
      toast.error(t('toastError'))
    }
  }

  const reset = () => setState(initialState)

  const getReferencePlaceholder = (): string => {
    switch (state.referenceType) {
      case 'ORDER': return t('refPlaceholderOrder')
      case 'DOCUMENT': return t('refPlaceholderDocument')
      case 'MACHINE': return t('refPlaceholderMachine')
      default: return ''
    }
  }

  const getReferenceLabel = (): string => {
    const cfg = REF_TYPE_CONFIG.find((c) => c.value === state.referenceType)
    return cfg ? t(cfg.labelKey as Parameters<typeof t>[0]) : ''
  }

  const getReferenceValue = (): string => {
    if (state.referenceType === 'MACHINE') return state.machineId
    if (state.referenceType === 'NONE') return t('refTypeNone')
    return state.referenceId || '\u2014'
  }

  const activeRefConfig = REF_TYPE_CONFIG.find((c) => c.value === state.referenceType)
  const totalQuantity = state.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Step indicator — scrollable on mobile */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map(({ num, key }, idx) => {
          const isActive = state.step === num
          const isCompleted = state.step > num
          return (
            <React.Fragment key={num}>
              {idx > 0 && (
                <div className={cn(
                  'h-px w-6 sm:w-8 mx-0.5 sm:mx-1 shrink-0 transition-colors',
                  isCompleted ? 'bg-primary' : 'bg-border'
                )} />
              )}
              <button
                type="button"
                onClick={() => {
                  if (isCompleted) setStep(num as Step)
                }}
                disabled={!isCompleted}
                className={cn(
                  'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap shrink-0',
                  isActive && 'bg-primary text-primary-foreground shadow-sm',
                  isCompleted && 'bg-muted text-foreground hover:bg-accent cursor-pointer',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground cursor-default',
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                ) : (
                  <span className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold',
                    isActive ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
                  )}>
                    {num}
                  </span>
                )}
                <span>{t(key as Parameters<typeof t>[0])}</span>
              </button>
            </React.Fragment>
          )
        })}
      </div>

      {/* Step 1: Select Reference */}
      {state.step === 1 && (
        <div className="space-y-6">
          {/* Reference Type Cards — 2x2 grid */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground mb-3 block">
              {t('labelReferenceType')}
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REF_TYPE_CONFIG.map((cfg) => {
                const Icon = cfg.icon
                const isSelected = state.referenceType === cfg.value
                return (
                  <button
                    key={cfg.value}
                    type="button"
                    onClick={() => selectReferenceType(cfg.value)}
                    className={cn(
                      'group relative flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected
                        ? 'border-primary bg-card shadow-sm'
                        : 'border-transparent bg-card hover:border-border hover:shadow-sm'
                    )}
                  >
                    {/* Icon */}
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
                      isSelected
                        ? 'bg-primary/10'
                        : 'bg-muted'
                    )}>
                      <Icon className={cn(
                        'h-5 w-5 transition-colors',
                        isSelected ? 'text-primary' : 'text-muted-foreground'
                      )} />
                    </div>

                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm">
                        {t(cfg.labelKey as Parameters<typeof t>[0])}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {t(cfg.descKey as Parameters<typeof t>[0])}
                      </div>
                    </div>

                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Reference ID Input — slides in when needed */}
          {state.referenceType !== 'NONE' && (
            <Card className="border-dashed">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div>
                  <Label className="text-sm font-medium">
                    {state.referenceType === 'MACHINE' ? t('labelMachineId') : t('labelReference')}
                  </Label>
                  <Input
                    value={state.referenceType === 'MACHINE' ? state.machineId : state.referenceId}
                    onChange={(e) => {
                      if (state.referenceType === 'MACHINE') {
                        setState((s) => ({ ...s, machineId: e.target.value }))
                      } else {
                        setState((s) => ({ ...s, referenceId: e.target.value }))
                      }
                    }}
                    placeholder={getReferencePlaceholder()}
                    className="mt-1.5 w-full sm:max-w-md font-mono text-base sm:text-sm"
                    autoFocus
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground">{t('labelNotes')}</Label>
            <Textarea
              value={state.notes}
              onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
              className="mt-1.5 max-w-md"
              rows={2}
            />
          </div>

          {/* Action */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              disabled={!canProceedFromStep1()}
              onClick={() => setStep(2)}
              className="gap-2 min-h-[44px] sm:min-h-0 w-full sm:w-auto"
            >
              {t('actionNext')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Select Articles */}
      {state.step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('stepArticles')}</CardTitle>
            <CardDescription>
              {activeRefConfig && (
                <span className="inline-flex items-center gap-1.5">
                  {React.createElement(activeRefConfig.icon, {
                    className: 'h-3.5 w-3.5 text-primary',
                  })}
                  <span>{getReferenceLabel()}: </span>
                  <span className="font-mono text-foreground">{getReferenceValue()}</span>
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Article Search */}
            <div className="w-full sm:max-w-md">
              <Label className="text-sm font-medium">{t('searchArticle')}</Label>
              <div className="mt-1.5">
                <ArticleSearchPopover
                  value={null}
                  onSelect={addArticle}
                  placeholder={t('searchArticle')}
                />
              </div>
            </div>

            {/* Article Table */}
            {state.items.length > 0 ? (
              <>
                {/* Mobile: card-based article list */}
                <div className="divide-y rounded-lg border sm:hidden">
                  {state.items.map((item) => (
                    <div key={item.articleId} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.article.name}</p>
                          <p className="text-xs font-mono text-muted-foreground">{item.article.number}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('colCurrentStock')}: {item.article.currentStock} {item.article.unit}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={item.article.currentStock}
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.articleId, parseInt(e.target.value) || 1)}
                            className="w-20 h-10 rounded-md border bg-background px-3 text-right text-base font-mono"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-destructive shrink-0"
                            onClick={() => removeArticle(item.articleId)}
                          >
                            &times;
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden sm:block rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>{t('colArticleNumber')}</TableHead>
                        <TableHead>{t('colArticle')}</TableHead>
                        <TableHead className="text-right">{t('colCurrentStock')}</TableHead>
                        <TableHead>{t('colWithdrawQuantity')}</TableHead>
                        <TableHead>{t('colUnit')}</TableHead>
                        <TableHead></TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.items.map((item) => (
                        <WithdrawalArticleRow
                          key={item.articleId}
                          article={item.article}
                          quantity={item.quantity}
                          onChange={updateQuantity}
                          onRemove={removeArticle}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <PackageOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t('errorNoArticles')}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                {t('actionBack')}
              </Button>
              <Button
                disabled={!canProceedFromStep2()}
                onClick={() => setStep(3)}
                className="gap-2"
              >
                {t('actionNext')}
                <ArrowRight className="h-4 w-4" />
              </Button>
              {state.items.length > 0 && (
                <span className="ml-auto text-sm text-muted-foreground">
                  {t('summaryArticleCount', { count: state.items.length })}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Confirm */}
      {state.step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('confirmTitle')}</CardTitle>
            <CardDescription>{t('confirmDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Reference summary badge */}
            {activeRefConfig && (
              <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-muted/50">
                {React.createElement(activeRefConfig.icon, {
                  className: 'h-4 w-4 text-primary',
                })}
                <span className="font-medium">{getReferenceLabel()}</span>
                <span className="font-mono text-muted-foreground">{getReferenceValue()}</span>
              </div>
            )}

            {/* Confirm Table */}
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t('confirmArticle')}</TableHead>
                    <TableHead className="text-right w-[120px]">{t('confirmQuantity')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.items.map((item) => (
                    <TableRow key={item.articleId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs shrink-0">
                            {item.article.number}
                          </Badge>
                          <span className="text-sm">{item.article.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono font-semibold text-red-600 dark:text-red-400">
                          -{item.quantity}
                        </span>
                        {item.article.unit && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {item.article.unit}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Total */}
            <div className="flex justify-end text-sm text-muted-foreground">
              {t('summaryTotalQuantity', { total: totalQuantity })}
            </div>

            {/* Notes preview */}
            {state.notes && (
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <span className="font-medium text-muted-foreground">{t('labelNotes')}: </span>
                <span>{state.notes}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                {t('actionBack')}
              </Button>
              <Button
                onClick={handleWithdraw}
                disabled={batchMutation.isPending}
                className="gap-2 min-h-[48px] sm:min-h-0 text-base sm:text-sm"
                variant="destructive"
              >
                {batchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackageMinus className="h-4 w-4" />
                )}
                {batchMutation.isPending ? t('loading') : t('confirmBook')}
              </Button>
              <Button variant="ghost" onClick={reset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                {t('actionCancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
