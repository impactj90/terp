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
import { useCreateWeekPlan } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type WeekPlan = components['schemas']['WeekPlan']

interface CopyWeekPlanDialogProps {
  weekPlan: WeekPlan | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CopyWeekPlanDialog({ weekPlan, open, onOpenChange }: CopyWeekPlanDialogProps) {
  const t = useTranslations('adminWeekPlans')
  const [newCode, setNewCode] = React.useState('')
  const [newName, setNewName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateWeekPlan()

  // Initialize fields when dialog opens
  React.useEffect(() => {
    if (open && weekPlan) {
      setNewCode(`${weekPlan.code}-COPY`)
      setNewName(`${weekPlan.name} (Copy)`)
      setError(null)
    }
  }, [open, weekPlan])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!weekPlan) return

    if (!newCode.trim()) {
      setError(t('validationCodeRequired'))
      return
    }
    if (!newName.trim()) {
      setError(t('validationNameRequired'))
      return
    }

    try {
      await createMutation.mutateAsync({
        body: {
          code: newCode.trim(),
          name: newName.trim(),
          description: weekPlan.description ?? undefined,
          monday_day_plan_id: weekPlan.monday_day_plan_id ?? undefined,
          tuesday_day_plan_id: weekPlan.tuesday_day_plan_id ?? undefined,
          wednesday_day_plan_id: weekPlan.wednesday_day_plan_id ?? undefined,
          thursday_day_plan_id: weekPlan.thursday_day_plan_id ?? undefined,
          friday_day_plan_id: weekPlan.friday_day_plan_id ?? undefined,
          saturday_day_plan_id: weekPlan.saturday_day_plan_id ?? undefined,
          sunday_day_plan_id: weekPlan.sunday_day_plan_id ?? undefined,
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
            {t('copyDescription', { name: weekPlan?.name ?? '' })}
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
              disabled={createMutation.isPending}
            >
              {t('buttonCancel')}
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
