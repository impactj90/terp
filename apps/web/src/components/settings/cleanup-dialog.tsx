'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TagInput } from '@/components/ui/tag-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useCleanupDeleteBookings,
  useCleanupDeleteBookingData,
  useCleanupReReadBookings,
  useCleanupMarkDeleteOrders,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type CleanupResult = components['schemas']['CleanupResult']

export type CleanupType = 'delete-bookings' | 'delete-booking-data' | 're-read-bookings' | 'mark-delete-orders'

interface CleanupDialogProps {
  type: CleanupType | null
  onClose: () => void
}

type DialogStep = 'input' | 'preview' | 'confirm' | 'success'

function getOperationLabel(t: ReturnType<typeof useTranslations<'adminSettings'>>, cleanupType: CleanupType): string {
  switch (cleanupType) {
    case 'delete-bookings': return t('cleanupDeleteBookings')
    case 'delete-booking-data': return t('cleanupDeleteBookingData')
    case 're-read-bookings': return t('cleanupReReadBookings')
    case 'mark-delete-orders': return t('cleanupMarkDeleteOrders')
  }
}

function getOperationDesc(t: ReturnType<typeof useTranslations<'adminSettings'>>, cleanupType: CleanupType): string {
  switch (cleanupType) {
    case 'delete-bookings': return t('cleanupDeleteBookingsDesc')
    case 'delete-booking-data': return t('cleanupDeleteBookingDataDesc')
    case 're-read-bookings': return t('cleanupReReadBookingsDesc')
    case 'mark-delete-orders': return t('cleanupMarkDeleteOrdersDesc')
  }
}

export function CleanupDialog({ type, onClose }: CleanupDialogProps) {
  const t = useTranslations('adminSettings')

  const [step, setStep] = React.useState<DialogStep>('input')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [employeeIds, setEmployeeIds] = React.useState<string[]>([])
  const [orderIds, setOrderIds] = React.useState<string[]>([])
  const [previewResult, setPreviewResult] = React.useState<CleanupResult | null>(null)
  const [confirmText, setConfirmText] = React.useState('')
  const [executeResult, setExecuteResult] = React.useState<CleanupResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const deleteBookingsMutation = useCleanupDeleteBookings()
  const deleteBookingDataMutation = useCleanupDeleteBookingData()
  const reReadBookingsMutation = useCleanupReReadBookings()
  const markDeleteOrdersMutation = useCleanupMarkDeleteOrders()

  // Reset state when dialog opens or type changes
  React.useEffect(() => {
    if (type) {
      setStep('input')
      setDateFrom('')
      setDateTo('')
      setEmployeeIds([])
      setOrderIds([])
      setPreviewResult(null)
      setConfirmText('')
      setExecuteResult(null)
      setError(null)
    }
  }, [type])

  const isDateBased = type === 'delete-bookings' || type === 'delete-booking-data' || type === 're-read-bookings'
  const isOrderBased = type === 'mark-delete-orders'

  const confirmPhrase = t('cleanupDialogConfirmPhrase')
  const operationLabel = type ? getOperationLabel(t, type) : ''
  const operationDesc = type ? getOperationDesc(t, type) : ''

  const getMutation = () => {
    switch (type) {
      case 'delete-bookings': return deleteBookingsMutation
      case 'delete-booking-data': return deleteBookingDataMutation
      case 're-read-bookings': return reReadBookingsMutation
      case 'mark-delete-orders': return markDeleteOrdersMutation
      default: return null
    }
  }

  const buildRequestBody = (confirm: boolean) => {
    if (isDateBased) {
      return {
        date_from: dateFrom,
        date_to: dateTo,
        employee_ids: employeeIds.length > 0 ? employeeIds : undefined,
        confirm,
      }
    }
    return {
      order_ids: orderIds,
      confirm,
    }
  }

  const canPreview = () => {
    if (isDateBased) return dateFrom && dateTo
    if (isOrderBased) return orderIds.length > 0
    return false
  }

  const isPending = getMutation()?.isPending ?? false

  const handlePreview = async () => {
    setError(null)
    const mutation = getMutation()
    if (!mutation) return

    try {
      const body = buildRequestBody(false)
      const result = await mutation.mutateAsync({ body } as never)
      setPreviewResult(result as CleanupResult)
      setStep('preview')
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Preview failed')
    }
  }

  const handleExecute = async () => {
    setError(null)
    const mutation = getMutation()
    if (!mutation) return

    try {
      const body = buildRequestBody(true)
      const result = await mutation.mutateAsync({ body } as never)
      setExecuteResult(result as CleanupResult)
      setStep('success')
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? 'Execution failed')
    }
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <Dialog open={!!type} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        {/* Input Step */}
        {step === 'input' && (
          <>
            <DialogHeader>
              <DialogTitle>{operationLabel}</DialogTitle>
              <DialogDescription>
                {operationDesc}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {isDateBased && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cleanupDateFrom">{t('cleanupDateFrom')}</Label>
                    <Input
                      id="cleanupDateFrom"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cleanupDateTo">{t('cleanupDateTo')}</Label>
                    <Input
                      id="cleanupDateTo"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('cleanupEmployeeFilter')}</Label>
                    <TagInput
                      value={employeeIds}
                      onChange={setEmployeeIds}
                      placeholder={t('cleanupEmployeePlaceholder')}
                    />
                  </div>
                </>
              )}

              {isOrderBased && (
                <div className="space-y-2">
                  <Label>{t('cleanupOrderIds')}</Label>
                  <TagInput
                    value={orderIds}
                    onChange={setOrderIds}
                    placeholder={t('cleanupOrderIdsPlaceholder')}
                  />
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('cleanupDialogCancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handlePreview}
                disabled={!canPreview() || isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? t('cleanupDialogPreviewing') : t('cleanupPreview')}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Preview Step */}
        {step === 'preview' && previewResult && (
          <>
            <DialogHeader>
              <DialogTitle>{t('cleanupDialogPreviewTitle', { operation: operationLabel })}</DialogTitle>
              <DialogDescription>
                {t('cleanupDialogPreviewMessage', { count: previewResult.affected_count })}
              </DialogDescription>
            </DialogHeader>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('cleanupDialogCancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setStep('confirm')}
              >
                {t('cleanupExecute')}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Confirm Step */}
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('cleanupDialogConfirmTitle', { operation: operationLabel })}</DialogTitle>
              <DialogDescription>
                {t('cleanupDialogConfirmMessage', { phrase: confirmPhrase })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={t('cleanupDialogConfirmPlaceholder', { phrase: confirmPhrase })}
              />

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('cleanupDialogCancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleExecute}
                disabled={confirmText !== confirmPhrase || isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? t('cleanupDialogExecuting') : t('cleanupDialogConfirm')}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Success Step */}
        {step === 'success' && executeResult && (
          <>
            <DialogHeader>
              <DialogTitle>{operationLabel}</DialogTitle>
              <DialogDescription>
                {t('cleanupDialogSuccess', { count: executeResult.affected_count })}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={handleClose}>
                {t('cleanupDialogCancel')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
