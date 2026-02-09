'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Pencil, Trash2, Play } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useSchedule,
  useDeleteSchedule,
  useExecuteSchedule,
  useScheduleExecutions,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ScheduleTimingBadge,
  ScheduleFormSheet,
  ScheduleTaskList,
  ScheduleExecutionLog,
} from '@/components/schedules'

export default function ScheduleDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const t = useTranslations('adminSchedules')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['schedules.manage'])

  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const { data: schedule, isLoading } = useSchedule(params.id, !authLoading && !permLoading && canAccess)
  const { data: executionsData } = useScheduleExecutions(params.id, !authLoading && !permLoading && canAccess)
  const deleteMutation = useDeleteSchedule()
  const executeMutation = useExecuteSchedule()

  const executions = executionsData?.data ?? []

  React.useEffect(() => {
    if (!authLoading && !permLoading && !canAccess) {
      router.push('/dashboard')
    }
  }, [authLoading, permLoading, canAccess, router])

  const handleDelete = async () => {
    await deleteMutation.mutateAsync({ path: { id: params.id } })
    router.push('/admin/schedules')
  }

  const handleExecute = async () => {
    try {
      await executeMutation.mutateAsync({ path: { id: params.id } })
      // Execution started successfully - UI will refresh via query invalidation
    } catch {
      // Error is handled by the mutation
    }
  }

  if (authLoading || isLoading) {
    return <ScheduleDetailSkeleton />
  }

  if (!schedule) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/admin/schedules')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('actionView')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/admin/schedules')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{schedule.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <ScheduleTimingBadge
              timingType={schedule.timing_type}
              timingConfig={schedule.timing_config}
            />
            {schedule.is_enabled ? (
              <span className="text-sm text-green-600">{t('statusEnabled')}</span>
            ) : (
              <span className="text-sm text-muted-foreground">{t('statusDisabled')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExecute}
            disabled={executeMutation.isPending}
          >
            <Play className="mr-2 h-4 w-4" />
            {t('executeNow')}
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {t('actionEdit')}
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('actionDelete')}
          </Button>
        </div>
      </div>

      {/* Description */}
      {schedule.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{schedule.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">{t('tabTasks')}</TabsTrigger>
          <TabsTrigger value="executions">{t('tabExecutions')}</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6">
          <ScheduleTaskList scheduleId={params.id} tasks={schedule.tasks ?? []} />
        </TabsContent>

        <TabsContent value="executions" className="mt-6">
          <ScheduleExecutionLog executions={executions} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ScheduleFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        schedule={schedule}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deleteSchedule')}
        description={t('deleteDescription', { name: schedule.name ?? '' })}
        onConfirm={handleDelete}
        confirmLabel={t('delete')}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </div>
  )
}

function ScheduleDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-[400px]" />
    </div>
  )
}
