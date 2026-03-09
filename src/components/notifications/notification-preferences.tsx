'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Alert } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks'

interface PreferencesState {
  approvalsEnabled: boolean
  errorsEnabled: boolean
  remindersEnabled: boolean
  systemEnabled: boolean
}

export function NotificationPreferencesCard() {
  const t = useTranslations('notifications')
  const tc = useTranslations('common')
  const { data, isLoading } = useNotificationPreferences()
  const updatePreferences = useUpdateNotificationPreferences()

  const [formState, setFormState] = useState<PreferencesState>({
    approvalsEnabled: true,
    errorsEnabled: true,
    remindersEnabled: true,
    systemEnabled: true,
  })
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setFormState({
        approvalsEnabled: data.approvalsEnabled,
        errorsEnabled: data.errorsEnabled,
        remindersEnabled: data.remindersEnabled,
        systemEnabled: data.systemEnabled,
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
      await updatePreferences.mutateAsync(formState)
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
            checked={formState.approvalsEnabled}
            onCheckedChange={handleToggle('approvalsEnabled')}
            disabled={isLoading || updatePreferences.isPending}
          />
          <Separator />
          <PreferenceRow
            title={t('categoryErrors')}
            description={t('categoryErrorsDescription')}
            checked={formState.errorsEnabled}
            onCheckedChange={handleToggle('errorsEnabled')}
            disabled={isLoading || updatePreferences.isPending}
          />
          <Separator />
          <PreferenceRow
            title={t('categoryReminders')}
            description={t('categoryRemindersDescription')}
            checked={formState.remindersEnabled}
            onCheckedChange={handleToggle('remindersEnabled')}
            disabled={isLoading || updatePreferences.isPending}
          />
          <Separator />
          <PreferenceRow
            title={t('categorySystem')}
            description={t('categorySystemDescription')}
            checked={formState.systemEnabled}
            onCheckedChange={handleToggle('systemEnabled')}
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
