'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { useCreateScheduleTask, useUpdateScheduleTask, useTaskCatalog } from '@/hooks/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

type ScheduleTask = components['schemas']['ScheduleTask']
type TaskType = ScheduleTask['task_type']

interface ScheduleTaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scheduleId: string
  task?: ScheduleTask | null
  existingTasks: ScheduleTask[]
}

interface FormState {
  taskType: TaskType
  sortOrder: number
  parameters: string
  isEnabled: boolean
}

const DEFAULT_TASK_TYPE: TaskType = 'calculate_days'

export function ScheduleTaskFormDialog({
  open,
  onOpenChange,
  scheduleId,
  task,
  existingTasks,
}: ScheduleTaskFormDialogProps) {
  const t = useTranslations('adminSchedules')
  const isEdit = !!task
  const [form, setForm] = React.useState<FormState>({
    taskType: DEFAULT_TASK_TYPE,
    sortOrder: 1,
    parameters: '{}',
    isEnabled: true,
  })
  const [error, setError] = React.useState<string | null>(null)

  const { data: catalogData } = useTaskCatalog(open)
  const catalog = catalogData?.data ?? []

  const createMutation = useCreateScheduleTask()
  const updateMutation = useUpdateScheduleTask()

  React.useEffect(() => {
    if (open) {
      if (task) {
        setForm({
          taskType: task.task_type,
          sortOrder: task.sort_order,
          parameters: task.parameters ? JSON.stringify(task.parameters, null, 2) : '{}',
          isEnabled: task.is_enabled ?? true,
        })
      } else {
        const maxOrder = existingTasks.reduce(
          (max, t) => Math.max(max, t.sort_order),
          0
        )
        setForm({
          taskType: DEFAULT_TASK_TYPE,
          sortOrder: maxOrder + 1,
          parameters: '{}',
          isEnabled: true,
        })
      }
      setError(null)
    }
  }, [open, task, existingTasks])

  const handleSubmit = async () => {
    setError(null)

    let parsedParams: Record<string, unknown> = {}
    try {
      if (form.parameters.trim()) {
        parsedParams = JSON.parse(form.parameters)
      }
    } catch {
      setError(t('invalidJsonParameters'))
      return
    }

    try {
      if (isEdit && task) {
        await updateMutation.mutateAsync({
          path: { id: scheduleId, taskId: task.id },
          body: {
            task_type: form.taskType,
            sort_order: form.sortOrder,
            parameters: parsedParams,
            is_enabled: form.isEnabled,
          },
        })
      } else {
        await createMutation.mutateAsync({
          path: { id: scheduleId },
          body: {
            task_type: form.taskType,
            sort_order: form.sortOrder,
            parameters: parsedParams,
            is_enabled: form.isEnabled,
          },
        })
      }
      onOpenChange(false)
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? t('failedSaveTask'))
    }
  }

  const selectedCatalogEntry = catalog.find((c) => c.task_type === form.taskType)
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTask') : t('addTask')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('editTaskDescription') : t('addTaskDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="taskType">{t('taskType')}</Label>
            <Select
              value={form.taskType}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, taskType: v as TaskType }))
              }
              disabled={isSubmitting}
            >
              <SelectTrigger id="taskType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((entry) => (
                  <SelectItem key={entry.task_type} value={entry.task_type}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCatalogEntry?.description && (
              <p className="text-xs text-muted-foreground">
                {selectedCatalogEntry.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sortOrder">{t('taskSortOrder')}</Label>
            <Input
              id="sortOrder"
              type="number"
              min={1}
              value={form.sortOrder}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  sortOrder: parseInt(e.target.value, 10) || 1,
                }))
              }
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parameters">{t('taskParameters')}</Label>
            <Textarea
              id="parameters"
              value={form.parameters}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, parameters: e.target.value }))
              }
              disabled={isSubmitting}
              rows={4}
              className="font-mono text-sm"
              placeholder="{}"
            />
            <p className="text-xs text-muted-foreground">{t('taskParametersHelp')}</p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="isEnabled">{t('fieldEnabled')}</Label>
            <Switch
              id="isEnabled"
              checked={form.isEnabled}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, isEnabled: checked }))
              }
              disabled={isSubmitting}
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
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('addTask')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
