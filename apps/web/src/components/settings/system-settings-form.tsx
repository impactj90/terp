'use client'

import * as React from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, Info, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TimeInput } from '@/components/ui/time-input'
import { TagInput } from '@/components/ui/tag-input'
import { useSystemSettings, useUpdateSystemSettings } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type SystemSettings = components['schemas']['SystemSettings']

interface SettingsFormState {
  // Calculation
  roundingRelativeToPlan: boolean
  errorListEnabled: boolean
  trackedErrorCodes: string[]
  // Order
  autoFillOrderEndBookings: boolean
  followUpEntriesEnabled: boolean
  // Birthday
  birthdayWindowDaysBefore: number
  birthdayWindowDaysAfter: number
  // Proxy
  proxyEnabled: boolean
  proxyHost: string
  proxyPort: number | null
  proxyUsername: string
  proxyPassword: string
  // Server Alive
  serverAliveEnabled: boolean
  serverAliveExpectedCompletionTime: number | null
  serverAliveThresholdMinutes: number | null
  serverAliveNotifyAdmins: boolean
}

function mapApiToForm(data: SystemSettings): SettingsFormState {
  return {
    roundingRelativeToPlan: data.rounding_relative_to_plan ?? false,
    errorListEnabled: data.error_list_enabled ?? false,
    trackedErrorCodes: data.tracked_error_codes ?? [],
    autoFillOrderEndBookings: data.auto_fill_order_end_bookings ?? false,
    followUpEntriesEnabled: data.follow_up_entries_enabled ?? false,
    birthdayWindowDaysBefore: data.birthday_window_days_before ?? 0,
    birthdayWindowDaysAfter: data.birthday_window_days_after ?? 0,
    proxyEnabled: data.proxy_enabled ?? false,
    proxyHost: data.proxy_host ?? '',
    proxyPort: data.proxy_port ?? null,
    proxyUsername: data.proxy_username ?? '',
    proxyPassword: '',
    serverAliveEnabled: data.server_alive_enabled ?? false,
    serverAliveExpectedCompletionTime: data.server_alive_expected_completion_time ?? null,
    serverAliveThresholdMinutes: data.server_alive_threshold_minutes ?? null,
    serverAliveNotifyAdmins: data.server_alive_notify_admins ?? false,
  }
}

const INITIAL_STATE: SettingsFormState = {
  roundingRelativeToPlan: false,
  errorListEnabled: false,
  trackedErrorCodes: [],
  autoFillOrderEndBookings: false,
  followUpEntriesEnabled: false,
  birthdayWindowDaysBefore: 0,
  birthdayWindowDaysAfter: 0,
  proxyEnabled: false,
  proxyHost: '',
  proxyPort: null,
  proxyUsername: '',
  proxyPassword: '',
  serverAliveEnabled: false,
  serverAliveExpectedCompletionTime: null,
  serverAliveThresholdMinutes: null,
  serverAliveNotifyAdmins: false,
}

export function SystemSettingsForm() {
  const t = useTranslations('adminSettings')
  const { data, isLoading, error: loadError } = useSystemSettings()
  const updateMutation = useUpdateSystemSettings()

  const [form, setForm] = React.useState<SettingsFormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const initialValuesRef = React.useRef<SettingsFormState | null>(null)

  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    calculation: true,
    order: true,
    birthday: true,
    proxy: false,
    serverAlive: false,
  })

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Sync form state from API data
  React.useEffect(() => {
    if (data) {
      const initial = mapApiToForm(data)
      setForm(initial)
      initialValuesRef.current = initial
    }
  }, [data])

  // Track dirty state
  const isDirty = React.useMemo(() => {
    if (!initialValuesRef.current) return false
    return JSON.stringify(form) !== JSON.stringify(initialValuesRef.current)
  }, [form])

  const isSubmitting = updateMutation.isPending

  const handleSubmit = async () => {
    setError(null)
    setSuccess(false)

    try {
      await updateMutation.mutateAsync({
        body: {
          rounding_relative_to_plan: form.roundingRelativeToPlan,
          error_list_enabled: form.errorListEnabled,
          tracked_error_codes: form.trackedErrorCodes,
          auto_fill_order_end_bookings: form.autoFillOrderEndBookings,
          follow_up_entries_enabled: form.followUpEntriesEnabled,
          birthday_window_days_before: form.birthdayWindowDaysBefore,
          birthday_window_days_after: form.birthdayWindowDaysAfter,
          proxy_enabled: form.proxyEnabled,
          proxy_host: form.proxyHost || null,
          proxy_port: form.proxyPort,
          proxy_username: form.proxyUsername || null,
          proxy_password: form.proxyPassword || null,
          server_alive_enabled: form.serverAliveEnabled,
          server_alive_expected_completion_time: form.serverAliveExpectedCompletionTime,
          server_alive_threshold_minutes: form.serverAliveThresholdMinutes,
          server_alive_notify_admins: form.serverAliveNotifyAdmins,
        },
      })
      // Update initial values ref after successful save
      initialValuesRef.current = { ...form }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('saveFailed'))
    }
  }

  if (isLoading) {
    return null // Parent page handles skeleton
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('loadFailed')}</AlertDescription>
      </Alert>
    )
  }

  const NotYetActiveBanner = () => (
    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 shrink-0" />
      <span>{t('notYetActive')}</span>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Calculation Settings */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => toggleSection('calculation')}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t('sectionCalculation')}</CardTitle>
              <CardDescription>{t('sectionCalculationDesc')}</CardDescription>
            </div>
            {expandedSections.calculation ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </CardHeader>
        {expandedSections.calculation && (
          <CardContent className="space-y-4">
            {/* Rounding Relative to Plan */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="roundingRelativeToPlan" className="text-sm">{t('fieldRoundingRelativeToPlan')}</Label>
                <p className="text-xs text-muted-foreground">{t('fieldRoundingRelativeToPlanDesc')}</p>
              </div>
              <Switch
                id="roundingRelativeToPlan"
                checked={form.roundingRelativeToPlan}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, roundingRelativeToPlan: checked }))}
                disabled={isSubmitting}
              />
            </div>

            <NotYetActiveBanner />

            {/* Error List Enabled */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="errorListEnabled" className="text-sm">{t('fieldErrorListEnabled')}</Label>
                <p className="text-xs text-muted-foreground">{t('fieldErrorListEnabledDesc')}</p>
              </div>
              <Switch
                id="errorListEnabled"
                checked={form.errorListEnabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, errorListEnabled: checked }))}
                disabled={isSubmitting}
              />
            </div>

            {/* Tracked Error Codes */}
            <div className="space-y-2">
              <Label>{t('fieldTrackedErrorCodes')}</Label>
              <p className="text-xs text-muted-foreground">{t('fieldTrackedErrorCodesDesc')}</p>
              <TagInput
                value={form.trackedErrorCodes}
                onChange={(tags) => setForm((prev) => ({ ...prev, trackedErrorCodes: tags }))}
                placeholder={t('fieldTrackedErrorCodesPlaceholder')}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Order Settings */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => toggleSection('order')}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t('sectionOrder')}</CardTitle>
              <CardDescription>{t('sectionOrderDesc')}</CardDescription>
            </div>
            {expandedSections.order ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </CardHeader>
        {expandedSections.order && (
          <CardContent className="space-y-4">
            <NotYetActiveBanner />
            {/* Auto Fill Order End */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="autoFillOrderEnd" className="text-sm">{t('fieldAutoFillOrderEnd')}</Label>
                <p className="text-xs text-muted-foreground">{t('fieldAutoFillOrderEndDesc')}</p>
              </div>
              <Switch
                id="autoFillOrderEnd"
                checked={form.autoFillOrderEndBookings}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, autoFillOrderEndBookings: checked }))}
                disabled={isSubmitting}
              />
            </div>

            {/* Follow Up Entries */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="followUpEntries" className="text-sm">{t('fieldFollowUpEntries')}</Label>
                <p className="text-xs text-muted-foreground">{t('fieldFollowUpEntriesDesc')}</p>
              </div>
              <Switch
                id="followUpEntries"
                checked={form.followUpEntriesEnabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, followUpEntriesEnabled: checked }))}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Birthday Settings */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => toggleSection('birthday')}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t('sectionBirthday')}</CardTitle>
              <CardDescription>{t('sectionBirthdayDesc')}</CardDescription>
            </div>
            {expandedSections.birthday ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </CardHeader>
        {expandedSections.birthday && (
          <CardContent className="space-y-4">
            <NotYetActiveBanner />
            {/* Days Before */}
            <div className="space-y-2">
              <Label htmlFor="birthdayDaysBefore">{t('fieldBirthdayDaysBefore')}</Label>
              <p className="text-xs text-muted-foreground">{t('fieldBirthdayDaysBeforeDesc')}</p>
              <Input
                id="birthdayDaysBefore"
                type="number"
                min={0}
                max={90}
                value={form.birthdayWindowDaysBefore}
                onChange={(e) => setForm((prev) => ({ ...prev, birthdayWindowDaysBefore: parseInt(e.target.value) || 0 }))}
                disabled={isSubmitting}
              />
            </div>

            {/* Days After */}
            <div className="space-y-2">
              <Label htmlFor="birthdayDaysAfter">{t('fieldBirthdayDaysAfter')}</Label>
              <p className="text-xs text-muted-foreground">{t('fieldBirthdayDaysAfterDesc')}</p>
              <Input
                id="birthdayDaysAfter"
                type="number"
                min={0}
                max={90}
                value={form.birthdayWindowDaysAfter}
                onChange={(e) => setForm((prev) => ({ ...prev, birthdayWindowDaysAfter: parseInt(e.target.value) || 0 }))}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Proxy Settings */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => toggleSection('proxy')}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t('sectionProxy')}</CardTitle>
              <CardDescription>{t('sectionProxyDesc')}</CardDescription>
            </div>
            {expandedSections.proxy ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </CardHeader>
        {expandedSections.proxy && (
          <CardContent className="space-y-4">
            <NotYetActiveBanner />
            {/* Proxy Enabled */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="proxyEnabled" className="text-sm">{t('fieldProxyEnabled')}</Label>
                <p className="text-xs text-muted-foreground">{t('fieldProxyEnabledDesc')}</p>
              </div>
              <Switch
                id="proxyEnabled"
                checked={form.proxyEnabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, proxyEnabled: checked }))}
                disabled={isSubmitting}
              />
            </div>

            {/* Proxy Host */}
            <div className="space-y-2">
              <Label htmlFor="proxyHost">{t('fieldProxyHost')}</Label>
              <Input
                id="proxyHost"
                value={form.proxyHost}
                onChange={(e) => setForm((prev) => ({ ...prev, proxyHost: e.target.value }))}
                disabled={isSubmitting}
                placeholder={t('fieldProxyHostPlaceholder')}
              />
            </div>

            {/* Proxy Port */}
            <div className="space-y-2">
              <Label htmlFor="proxyPort">{t('fieldProxyPort')}</Label>
              <Input
                id="proxyPort"
                type="number"
                value={form.proxyPort ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, proxyPort: e.target.value ? parseInt(e.target.value) : null }))}
                disabled={isSubmitting}
                placeholder={t('fieldProxyPortPlaceholder')}
              />
            </div>

            {/* Proxy Username */}
            <div className="space-y-2">
              <Label htmlFor="proxyUsername">{t('fieldProxyUsername')}</Label>
              <Input
                id="proxyUsername"
                value={form.proxyUsername}
                onChange={(e) => setForm((prev) => ({ ...prev, proxyUsername: e.target.value }))}
                disabled={isSubmitting}
                placeholder={t('fieldProxyUsernamePlaceholder')}
              />
            </div>

            {/* Proxy Password (write-only) */}
            <div className="space-y-2">
              <Label htmlFor="proxyPassword">{t('fieldProxyPassword')}</Label>
              <div className="relative">
                <Input
                  id="proxyPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={form.proxyPassword}
                  onChange={(e) => setForm((prev) => ({ ...prev, proxyPassword: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('fieldProxyPasswordPlaceholder')}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Server Monitoring */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => toggleSection('serverAlive')}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t('sectionServerAlive')}</CardTitle>
              <CardDescription>{t('sectionServerAliveDesc')}</CardDescription>
            </div>
            {expandedSections.serverAlive ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </CardHeader>
        {expandedSections.serverAlive && (
          <CardContent className="space-y-4">
            <NotYetActiveBanner />
            {/* Server Alive Enabled */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="serverAliveEnabled" className="text-sm">{t('fieldServerAliveEnabled')}</Label>
                <p className="text-xs text-muted-foreground">{t('fieldServerAliveEnabledDesc')}</p>
              </div>
              <Switch
                id="serverAliveEnabled"
                checked={form.serverAliveEnabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, serverAliveEnabled: checked }))}
                disabled={isSubmitting}
              />
            </div>

            {/* Expected Completion Time */}
            <div className="space-y-2">
              <Label>{t('fieldServerAliveTime')}</Label>
              <p className="text-xs text-muted-foreground">{t('fieldServerAliveTimeDesc')}</p>
              <TimeInput
                value={form.serverAliveExpectedCompletionTime}
                onChange={(minutes) => setForm((prev) => ({ ...prev, serverAliveExpectedCompletionTime: minutes }))}
                disabled={isSubmitting}
              />
            </div>

            {/* Threshold Minutes */}
            <div className="space-y-2">
              <Label htmlFor="serverAliveThreshold">{t('fieldServerAliveThreshold')}</Label>
              <p className="text-xs text-muted-foreground">{t('fieldServerAliveThresholdDesc')}</p>
              <Input
                id="serverAliveThreshold"
                type="number"
                min={0}
                value={form.serverAliveThresholdMinutes ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, serverAliveThresholdMinutes: e.target.value ? parseInt(e.target.value) : null }))}
                disabled={isSubmitting}
                placeholder={t('fieldServerAliveThresholdPlaceholder')}
              />
            </div>

            {/* Notify Admins */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="serverAliveNotify" className="text-sm">{t('fieldServerAliveNotify')}</Label>
                <p className="text-xs text-muted-foreground">{t('fieldServerAliveNotifyDesc')}</p>
              </div>
              <Switch
                id="serverAliveNotify"
                checked={form.serverAliveNotifyAdmins}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, serverAliveNotifyAdmins: checked }))}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Error/Success messages */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{t('saveSuccess')}</AlertDescription>
        </Alert>
      )}

      {/* Save button */}
      <div className="flex justify-end gap-2 pt-4">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? t('saving') : t('saveSettings')}
        </Button>
      </div>
    </div>
  )
}
