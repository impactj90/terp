'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Alert } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/api'

interface PreferencesState {
  approvals_enabled: boolean
  errors_enabled: boolean
  reminders_enabled: boolean
  system_enabled: boolean
}

export function NotificationPreferencesCard() {
  const t = useTranslations('notifications')
  const tc = useTranslations('common')
  const { data, isLoading } = useNotificationPreferences()
  const updatePreferences = useUpdateNotificationPreferences()

  const [formState, setFormState] = useState<PreferencesState>({
    approvals_enabled: true,
    errors_enabled: true,
    reminders_enabled: true,
    system_enabled: true,
  })
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setFormState({
        approvals_enabled: data.approvals_enabled,
        errors_enabled: data.errors_enabled,
        reminders_enabled: data.reminders_enabled,
        system_enabled: data.system_enabled,
      })
    }
  }, [data])

  const handleToggle = (key: keyof PreferencesState) => (checked: boolean) => {
    setFormState((prev) => ({ ...prev, [key]: checked }))
  }

  const handleSave = async () => {
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      await updatePreferences.mutateAsync({ body: formState })
      setSuccessMessage(t('preferencesSaved'))
    } catch {
      setErrorMessage(t('preferencesSaveFailed'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('preferencesTitle')}</CardTitle>
        <CardDescription>{t('preferencesSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {successMessage && (
          <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle className="h-4 w-4" />
            <span className="ml-2">{successMessage}</span>
          </Alert>
        )}
        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="ml-2">{errorMessage}</span>
          </Alert>
        )}

        <div className="space-y-4">
          <PreferenceRow
            title={t('categoryApprovals')}
            description={t('categoryApprovalsDescription')}
            checked={formState.approvals_enabled}
            onCheckedChange={handleToggle('approvals_enabled')}
            disabled={isLoading || updatePreferences.isPending}
          />
          <Separator />
          <PreferenceRow
            title={t('categoryErrors')}
            description={t('categoryErrorsDescription')}
            checked={formState.errors_enabled}
            onCheckedChange={handleToggle('errors_enabled')}
            disabled={isLoading || updatePreferences.isPending}
          />
          <Separator />
          <PreferenceRow
            title={t('categoryReminders')}
            description={t('categoryRemindersDescription')}
            checked={formState.reminders_enabled}
            onCheckedChange={handleToggle('reminders_enabled')}
            disabled={isLoading || updatePreferences.isPending}
          />
          <Separator />
          <PreferenceRow
            title={t('categorySystem')}
            description={t('categorySystemDescription')}
            checked={formState.system_enabled}
            onCheckedChange={handleToggle('system_enabled')}
            disabled={isLoading || updatePreferences.isPending}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isLoading || updatePreferences.isPending}>
            {updatePreferences.isPending ? tc('saving') : tc('saveChanges')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface PreferenceRowProps {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

function PreferenceRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: PreferenceRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}
