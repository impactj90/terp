'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { useCreateMacro, useUpdateMacro } from '@/hooks/api'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { components } from '@/lib/api/types'

type Macro = components['schemas']['schema1']
type MacroType = Macro['macro_type']
type ActionType = Macro['action_type']

interface MacroFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  macro?: Macro | null
  onSuccess?: () => void
}

interface FormState {
  name: string
  description: string
  macroType: MacroType
  actionType: ActionType
  actionParams: string
  isActive: boolean
}

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  macroType: 'weekly',
  actionType: 'log_message',
  actionParams: '{}',
  isActive: true,
}

const MACRO_TYPES: { value: MacroType; labelKey: 'typeWeekly' | 'typeMonthly' }[] = [
  { value: 'weekly', labelKey: 'typeWeekly' },
  { value: 'monthly', labelKey: 'typeMonthly' },
]

const ACTION_TYPES: { value: ActionType; labelKey: 'actionLogMessage' | 'actionRecalculateTargetHours' | 'actionResetFlextime' | 'actionCarryForwardBalance' }[] = [
  { value: 'log_message', labelKey: 'actionLogMessage' },
  { value: 'recalculate_target_hours', labelKey: 'actionRecalculateTargetHours' },
  { value: 'reset_flextime', labelKey: 'actionResetFlextime' },
  { value: 'carry_forward_balance', labelKey: 'actionCarryForwardBalance' },
]

export function MacroFormSheet({
  open,
  onOpenChange,
  macro,
  onSuccess,
}: MacroFormSheetProps) {
  const t = useTranslations('adminMacros')
  const isEdit = !!macro
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateMacro()
  const updateMutation = useUpdateMacro()

  React.useEffect(() => {
    if (open) {
      if (macro) {
        setForm({
          name: macro.name ?? '',
          description: macro.description ?? '',
          macroType: macro.macro_type ?? 'weekly',
          actionType: macro.action_type ?? 'log_message',
          actionParams: macro.action_params
            ? JSON.stringify(macro.action_params, null, 2)
            : '{}',
          isActive: macro.is_active ?? true,
        })
      } else {
        setForm(INITIAL_STATE)
      }
      setError(null)
    }
  }, [open, macro])

  const handleSubmit = async () => {
    setError(null)

    if (!form.name.trim()) {
      setError(t('validationNameRequired'))
      return
    }

    let parsedParams: Record<string, never> | undefined = undefined
    try {
      if (form.actionParams.trim() && form.actionParams.trim() !== '{}') {
        parsedParams = JSON.parse(form.actionParams) as Record<string, never>
      }
    } catch {
      setError(t('invalidJsonParameters'))
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      macro_type: form.macroType,
      action_type: form.actionType,
      action_params: parsedParams,
      is_active: form.isActive,
    }

    try {
      if (isEdit && macro) {
        await updateMutation.mutateAsync({
          path: { id: macro.id },
          body: payload,
        })
      } else {
        await createMutation.mutateAsync({ body: payload })
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? t(isEdit ? 'failedUpdate' : 'failedCreate')
      )
    }
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editMacro') : t('newMacro')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldNamePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  disabled={isSubmitting}
                  placeholder={t('fieldDescriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            {/* Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="macroType">{t('fieldMacroType')}</Label>
                <Select
                  value={form.macroType}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, macroType: v as MacroType }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="macroType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MACRO_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {t(type.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="actionType">{t('fieldActionType')}</Label>
                <Select
                  value={form.actionType}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, actionType: v as ActionType }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="actionType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {t(type.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="actionParams">{t('fieldActionParams')}</Label>
                <Textarea
                  id="actionParams"
                  value={form.actionParams}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, actionParams: e.target.value }))
                  }
                  disabled={isSubmitting}
                  rows={4}
                  className="font-mono text-sm"
                  placeholder="{}"
                />
                <p className="text-xs text-muted-foreground">{t('fieldActionParamsHelp')}</p>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">{t('fieldActive')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('fieldActiveDescription')}
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isActive: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
