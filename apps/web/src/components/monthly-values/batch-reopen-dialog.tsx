'use client'

import * as React from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Unlock, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { useReopenMonthById } from '@/hooks/api'

interface BatchReopenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  month: number
  monthLabel: string
  selectedItems: Array<{ id: string; employee_name: string }>
}

type DialogState = 'confirming' | 'processing' | 'results'

interface ReopenResult {
  reopened: number
  errors: Array<{ employee_name: string; reason: string }>
}

export function BatchReopenDialog({
  open,
  onOpenChange,
  year: _year,
  month: _month,
  monthLabel,
  selectedItems,
}: BatchReopenDialogProps) {
  const t = useTranslations('monthlyValues')
  const tc = useTranslations('common')

  const [reason, setReason] = useState('')
  const [state, setState] = useState<DialogState>('confirming')
  const [result, setResult] = useState<ReopenResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const reopenMutation = useReopenMonthById()

  const handleClose = () => {
    setState('confirming')
    setReason('')
    setResult(null)
    setError(null)
    setProgress({ current: 0, total: 0 })
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    if (reason.trim().length < 10) {
      setError(t('batchReopen.reasonTooShort'))
      return
    }

    setError(null)
    setState('processing')
    setProgress({ current: 0, total: selectedItems.length })

    let successCount = 0
    const errors: Array<{ employee_name: string; reason: string }> = []

    for (const [i, item] of selectedItems.entries()) {
      setProgress({ current: i + 1, total: selectedItems.length })

      try {
        await reopenMutation.mutateAsync({
          path: { id: item.id },
          body: { reason: reason.trim() },
        })
        successCount++
      } catch {
        errors.push({ employee_name: item.employee_name, reason: 'Failed to reopen' })
      }
    }

    setResult({ reopened: successCount, errors })
    setState('results')
  }

  const isValid = reason.trim().length >= 10

  return (
    <Sheet open={open} onOpenChange={state === 'processing' ? undefined : handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5" />
            {t('batchReopen.title')}
          </SheetTitle>
          <SheetDescription>
            {t('batchReopen.description', { monthLabel })}
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
                {/* Warning */}
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{t('batchReopen.warning')}</AlertDescription>
                </Alert>

                {/* Info */}
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-sm font-medium">
                    {t('batchReopen.reopeningEmployees', { count: selectedItems.length })}
                  </p>
                </div>

                {/* Employee list */}
                <div className="rounded-lg border p-3 space-y-1 max-h-32 overflow-y-auto">
                  {selectedItems.map((item) => (
                    <div key={item.id} className="text-sm text-muted-foreground">
                      {item.employee_name}
                    </div>
                  ))}
                </div>

                {/* Reason textarea */}
                <div className="space-y-2">
                  <Label htmlFor="reason">
                    {t('batchReopen.reasonLabel')} <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="reason"
                    placeholder={t('batchReopen.reasonPlaceholder')}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    className={!isValid && reason.length > 0 ? 'border-destructive' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('batchReopen.minCharacters', { count: reason.length })}
                  </p>
                </div>
              </>
            )}

            {state === 'processing' && (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('batchReopen.progress', {
                    current: progress.current,
                    total: progress.total,
                  })}
                </p>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {state === 'results' && result && (
              <div className="space-y-4">
                <h4 className="font-medium">{t('batchReopen.resultTitle')}</h4>

                <div className="space-y-2">
                  {result.reopened > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>
                        {t('batchReopen.reopened')}: {result.reopened}
                      </span>
                    </div>
                  )}

                  {result.errors.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span>
                        {t('batchReopen.errors')}: {result.errors.length}
                      </span>
                    </div>
                  )}
                </div>

                {result.errors.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-1">
                    {result.errors.map((err, index) => (
                      <div key={index} className="text-xs text-muted-foreground">
                        {err.employee_name}: {err.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          {state === 'confirming' && (
            <>
              <Button variant="outline" onClick={handleClose} className="flex-1">
                {tc('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={!isValid || selectedItems.length === 0}
                className="flex-1"
              >
                {t('batchReopen.confirm')}
              </Button>
            </>
          )}

          {state === 'results' && (
            <Button onClick={handleClose} className="flex-1">
              {t('batchReopen.done')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
