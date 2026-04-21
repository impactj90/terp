'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useOvertimeRequestConfig,
  useUpdateOvertimeRequestConfig,
  usePendingReopenCount,
} from '@/hooks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'

export default function OvertimeRequestConfigPage() {
  const t = useTranslations('overtime_requests.admin.config')
  const router = useRouter()
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['settings.manage'])

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const enabled = !authLoading && !permLoading && canAccess
  const { data: config, isLoading } = useOvertimeRequestConfig(enabled)
  const update = useUpdateOvertimeRequestConfig()
  const pendingReopen = usePendingReopenCount(enabled)

  const [approvalRequired, setApprovalRequired] = React.useState(true)
  const [reopenRequired, setReopenRequired] = React.useState(true)
  const [leadTimeHours, setLeadTimeHours] = React.useState('0')
  const [monthlyWarnThresholdMinutes, setMonthlyWarnThresholdMinutes] =
    React.useState<string>('')
  const [escalationThresholdMinutes, setEscalationThresholdMinutes] =
    React.useState<string>('')
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  React.useEffect(() => {
    if (!config) return
    setApprovalRequired(config.approvalRequired)
    setReopenRequired(config.reopenRequired)
    setLeadTimeHours(String(config.leadTimeHours ?? 0))
    setMonthlyWarnThresholdMinutes(
      config.monthlyWarnThresholdMinutes !== null &&
        config.monthlyWarnThresholdMinutes !== undefined
        ? String(config.monthlyWarnThresholdMinutes)
        : ''
    )
    setEscalationThresholdMinutes(
      config.escalationThresholdMinutes !== null &&
        config.escalationThresholdMinutes !== undefined
        ? String(config.escalationThresholdMinutes)
        : ''
    )
  }, [config])

  const persist = async () => {
    try {
      await update.mutateAsync({
        approvalRequired,
        reopenRequired,
        leadTimeHours: Number(leadTimeHours) || 0,
        monthlyWarnThresholdMinutes:
          monthlyWarnThresholdMinutes === ''
            ? null
            : Number(monthlyWarnThresholdMinutes),
        escalationThresholdMinutes:
          escalationThresholdMinutes === ''
            ? null
            : Number(escalationThresholdMinutes),
      })
      toast.success(t('saved'))
      setConfirmOpen(false)
    } catch {
      toast.error('Error')
    }
  }

  const handleSave = async () => {
    const willDisableReopen = config?.reopenRequired === true && reopenRequired === false
    if (willDisableReopen) {
      setConfirmOpen(true)
      return
    }
    await persist()
  }

  if (authLoading || permLoading || isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full max-w-2xl" />
      </div>
    )
  }
  if (!canAccess) return null

  const pendingCount = pendingReopen.data?.count ?? 0

  return (
    <div className="container mx-auto py-6">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="approvalRequired" className="text-sm font-medium">
                {t('approvalRequired')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('approvalRequiredHint')}
              </p>
            </div>
            <Switch
              id="approvalRequired"
              checked={approvalRequired}
              onCheckedChange={setApprovalRequired}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="reopenRequired" className="text-sm font-medium">
                {t('reopenRequired')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('reopenRequiredHint')}
              </p>
            </div>
            <Switch
              id="reopenRequired"
              checked={reopenRequired}
              onCheckedChange={setReopenRequired}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="leadTimeHours">{t('leadTimeHours')}</Label>
            <Input
              id="leadTimeHours"
              type="number"
              min={0}
              value={leadTimeHours}
              onChange={(e) => setLeadTimeHours(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {t('leadTimeHoursHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="monthlyWarnThresholdMinutes">
              {t('monthlyWarnThresholdMinutes')}
            </Label>
            <Input
              id="monthlyWarnThresholdMinutes"
              type="number"
              min={0}
              value={monthlyWarnThresholdMinutes}
              onChange={(e) => setMonthlyWarnThresholdMinutes(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {t('monthlyWarnThresholdMinutesHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="escalationThresholdMinutes">
              {t('escalationThresholdMinutes')}
            </Label>
            <Input
              id="escalationThresholdMinutes"
              type="number"
              min={0}
              value={escalationThresholdMinutes}
              onChange={(e) => setEscalationThresholdMinutes(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {t('escalationThresholdMinutesHint')}
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={update.isPending}>
              {update.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t('save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('disableConfirmTitle')}
        description={t('disableConfirmBody', { count: pendingCount })}
        confirmLabel={t('disableConfirmContinue')}
        cancelLabel={t('disableConfirmCancel')}
        variant="destructive"
        isLoading={update.isPending}
        onConfirm={persist}
      />
    </div>
  )
}
