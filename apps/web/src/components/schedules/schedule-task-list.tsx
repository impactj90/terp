'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, Edit, GripVertical, ListTodo } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeleteScheduleTask, useUpdateScheduleTask } from '@/hooks/api'
import { ScheduleTaskFormDialog } from './schedule-task-form-dialog'

interface ScheduleTask {
  id: string
  taskType: string
  sortOrder: number
  parameters?: unknown
  isEnabled: boolean
}

interface ScheduleTaskListProps {
  scheduleId: string
  tasks: ScheduleTask[]
}

const TASK_TYPE_LABELS: Record<string, string> = {
  calculate_days: 'Calculate Days',
  calculate_months: 'Calculate Months',
  backup_database: 'Backup Database',
  send_notifications: 'Send Notifications',
  export_data: 'Export Data',
  alive_check: 'Alive Check',
  execute_macros: 'Execute Macros',
  generate_day_plans: 'Generate Day Plans',
}

export function ScheduleTaskList({ scheduleId, tasks }: ScheduleTaskListProps) {
  const t = useTranslations('adminSchedules')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editTask, setEditTask] = React.useState<ScheduleTask | null>(null)
  const [deleteTask, setDeleteTask] = React.useState<ScheduleTask | null>(null)

  const deleteMutation = useDeleteScheduleTask()
  const updateMutation = useUpdateScheduleTask()

  const sortedTasks = React.useMemo(() => {
    return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder)
  }, [tasks])

  const handleToggleEnabled = async (task: ScheduleTask, enabled: boolean) => {
    await updateMutation.mutateAsync({
      scheduleId,
      taskId: task.id,
      isEnabled: enabled,
    })
  }

  const handleConfirmDelete = async () => {
    if (!deleteTask) return
    await deleteMutation.mutateAsync({
      scheduleId,
      taskId: deleteTask.id,
    })
    setDeleteTask(null)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-medium">{t('taskListTitle')}</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('addTask')}
        </Button>
      </CardHeader>
      <CardContent>
        {sortedTasks.length === 0 ? (
          <div className="text-center py-8">
            <ListTodo className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
            <p className="mt-4 text-muted-foreground">{t('noTasks')}</p>
            <Button className="mt-4" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('addTask')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-4 rounded-lg border p-3 hover:bg-muted/50"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{task.sortOrder}</Badge>
                    <span className="font-medium">
                      {TASK_TYPE_LABELS[task.taskType] ?? task.taskType}
                    </span>
                  </div>
                  {typeof task.parameters === 'object' && task.parameters !== null && Object.keys(task.parameters as Record<string, unknown>).length > 0 ? (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {String(JSON.stringify(task.parameters))}
                    </p>
                  ) : null}
                </div>
                <Switch
                  checked={task.isEnabled ?? true}
                  onCheckedChange={(checked) => handleToggleEnabled(task, checked)}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditTask(task)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleteTask(task)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ScheduleTaskFormDialog
        open={createOpen || !!editTask}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditTask(null)
          }
        }}
        scheduleId={scheduleId}
        task={editTask}
        existingTasks={tasks}
      />

      <ConfirmDialog
        open={!!deleteTask}
        onOpenChange={(open) => !open && setDeleteTask(null)}
        title={t('deleteTask')}
        description={t('deleteTaskDescription')}
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </Card>
  )
}
