'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateTariff, useTariff } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type Tariff = components['schemas']['Tariff']

interface CopyTariffDialogProps {
  tariff: Tariff | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CopyTariffDialog({ tariff, open, onOpenChange }: CopyTariffDialogProps) {
  const t = useTranslations('adminTariffs')
  const [newCode, setNewCode] = React.useState('')
  const [newName, setNewName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  // Fetch full tariff details to get all data for copying
  const { data: fullTariff } = useTariff(tariff?.id ?? '', open && !!tariff)

  const createMutation = useCreateTariff()

  // Initialize fields when dialog opens
  React.useEffect(() => {
    if (open && tariff) {
      setNewCode(t('defaultCopyCode', { code: tariff.code }))
      setNewName(t('defaultCopyName', { name: tariff.name }))
      setError(null)
    }
  }, [open, tariff])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!tariff || !fullTariff) return

    if (!newCode.trim()) {
      setError(t('errorCodeRequired'))
      return
    }
    if (!newName.trim()) {
      setError(t('errorNameRequired'))
      return
    }

    try {
      // Create new tariff with same properties but new code/name
      await createMutation.mutateAsync({
        body: {
          code: newCode.trim(),
          name: newName.trim(),
          description: fullTariff.description || undefined,
          week_plan_id: fullTariff.week_plan_id || undefined,
          valid_from: fullTariff.valid_from || undefined,
          valid_to: fullTariff.valid_to || undefined,
        },
      })
      // Note: Breaks need to be copied separately if needed
      // For MVP, we just copy the base tariff
      onOpenChange(false)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('errorCopyFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('copyTitle')}</DialogTitle>
          <DialogDescription>
            {t('copyDescription', { name: tariff?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newCode">{t('newCode')} *</Label>
              <Input
                id="newCode"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder={t('newCodePlaceholder')}
                maxLength={20}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newName">{t('newName')} *</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('newNamePlaceholder')}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('copyButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
