'use client'

import * as React from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Lock, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCloseMonthBatch } from '@/hooks/api'

interface BatchCloseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  month: number
  monthLabel: string
  selectedIds: string[]
  selectedEmployeeIds: string[]
  departmentId: string | null
  departmentName: string | null
}

type DialogState = 'confirming' | 'processing' | 'results'

interface BatchCloseResult {
  closed_count?: number
  skipped_count?: number
  error_count?: number
  errors?: Array<{ employee_id?: string; reason?: string }>
}

export function BatchCloseDialog({
  open,
  onOpenChange,
  year,
  month,
  monthLabel,
  selectedIds,
  selectedEmployeeIds,
  departmentId,
  departmentName,
}: BatchCloseDialogProps) {
  const t = useTranslations('monthlyValues')
  const tc = useTranslations('common')

  const [recalculate, setRecalculate] = useState(true)
  const [state, setState] = useState<DialogState>('confirming')
  const [result, setResult] = useState<BatchCloseResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const closeBatchMutation = useCloseMonthBatch()

  const handleClose = () => {
    setState('confirming')
    setRecalculate(true)
    setResult(null)
    setError(null)
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    setError(null)
    setState('processing')

    try {
      type CloseBatchBody = {
        year: number
        month: number
        recalculate?: boolean
        employee_ids?: string[]
        department_id?: string
      }

      const body: CloseBatchBody = {
        year,
        month,
        recalculate,
      }

      if (selectedEmployeeIds.length > 0) {
        body.employee_ids = selectedEmployeeIds
      } else if (departmentId) {
        body.department_id = departmentId
      }

      const data = await closeBatchMutation.mutateAsync({
        body,
      } as never)

      setResult(data as unknown as BatchCloseResult)
      setState('results')
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Failed to close months')
      setState('confirming')
    }
  }

  const getInfoText = () => {
    if (selectedIds.length > 0) {
      return t('batchClose.closingEmployees', { count: selectedIds.length })
    }
    if (departmentName) {
      return t('batchClose.closingDepartment', { department: departmentName })
    }
    return t('batchClose.closingAll')
  }

  return (
    <Sheet open={open} onOpenChange={state === 'processing' ? undefined : handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t('batchClose.title')}
          </SheetTitle>
          <SheetDescription>
            {t('batchClose.description', { monthLabel })}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {state === 'confirming' && (
              <>
                {/* Info panel */}
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-sm font-medium">{getInfoText()}</p>
                </div>

                {/* Recalculate checkbox */}
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="recalculate"
                    checked={recalculate}
                    onCheckedChange={(checked) => setRecalculate(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="recalculate" className="cursor-pointer">
                      {t('batchClose.recalculateBeforeClosing')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('batchClose.recalculateDescription')}
                    </p>
                  </div>
                </div>
              </>
            )}

            {state === 'processing' && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('batchClose.processing')}</p>
              </div>
            )}

            {state === 'results' && result && (
              <div className="space-y-4">
                <h4 className="font-medium">{t('batchClose.resultTitle')}</h4>

                <div className="space-y-2">
                  {(result.closed_count ?? 0) > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>
                        {t('batchClose.closed')}: {result.closed_count}
                      </span>
                    </div>
                  )}

                  {(result.skipped_count ?? 0) > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <span>
                        {t('batchClose.skipped')}: {result.skipped_count}
                      </span>
                    </div>
                  )}

                  {(result.error_count ?? 0) > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span>
                        {t('batchClose.errors')}: {result.error_count}
                      </span>
                    </div>
                  )}
                </div>

                {result.errors && result.errors.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium text-muted-foreground">
                      {t('batchClose.errorDetail')}
                    </h5>
                    <div className="rounded-lg border p-3 space-y-1">
                      {result.errors.map((err, index) => (
                        <div key={index} className="text-xs text-muted-foreground">
                          <span className="font-mono">{err.employee_id}</span>: {err.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          {state === 'confirming' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={closeBatchMutation.isPending}
                className="flex-1"
              >
                {tc('cancel')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={closeBatchMutation.isPending}
                className="flex-1"
              >
                {closeBatchMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('batchClose.confirm')}
              </Button>
            </>
          )}

          {state === 'results' && (
            <Button onClick={handleClose} className="flex-1">
              {t('batchClose.done')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
