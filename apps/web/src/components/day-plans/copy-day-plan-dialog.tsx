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
import { useCopyDayPlan } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type DayPlan = components['schemas']['DayPlan']

const RESERVED_DAY_PLAN_CODES = new Set(['U', 'K', 'S'])

const isReservedDayPlanCode = (code: string) =>
  RESERVED_DAY_PLAN_CODES.has(code.trim().toUpperCase())

interface CopyDayPlanDialogProps {
  dayPlan: DayPlan | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CopyDayPlanDialog({ dayPlan, open, onOpenChange }: CopyDayPlanDialogProps) {
  const t = useTranslations('adminDayPlans')
  const [newCode, setNewCode] = React.useState('')
  const [newName, setNewName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const copyMutation = useCopyDayPlan()

  // Initialize fields when dialog opens
  React.useEffect(() => {
    if (open && dayPlan) {
      setNewCode(`${dayPlan.code}-COPY`)
      setNewName(`${dayPlan.name} (Copy)`)
      setError(null)
    }
  }, [open, dayPlan])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!dayPlan) return

    if (!newCode.trim()) {
      setError(t('validationCodeRequired'))
      return
    }
    if (isReservedDayPlanCode(newCode)) {
      setError(t('validationCodeReserved'))
      return
    }
    if (!newName.trim()) {
      setError(t('validationNameRequired'))
      return
    }

    try {
      await copyMutation.mutateAsync({
        path: { id: dayPlan.id },
        body: {
          new_code: newCode.trim(),
          new_name: newName.trim(),
        },
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorCopyFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('copyTitle')}</DialogTitle>
          <DialogDescription>
            {t('copyDescription', { name: dayPlan?.name ?? '' })}
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
                placeholder={t('placeholderCopyCode')}
                maxLength={20}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newName">{t('newName')} *</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('placeholderCopyName')}
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
              disabled={copyMutation.isPending}
            >
              {t('buttonCancel')}
            </Button>
            <Button type="submit" disabled={copyMutation.isPending}>
              {copyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('copyButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
