'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TaskStatusBadge, TaskTypeBadge } from './task-status-badge'
import {
  useCompleteCrmTask,
  useCancelCrmTask,
  useReopenCrmTask,
  useDeleteCrmTask,
} from '@/hooks'
import { toast } from 'sonner'
import { CheckCircle, XCircle, RotateCcw, Edit, Trash2, User, Users, Check, Minus } from 'lucide-react'

interface Assignee {
  id: string
  employeeId?: string | null
  teamId?: string | null
  readAt?: string | null
  employee?: { id: string; firstName: string; lastName: string } | null
  team?: { id: string; name: string } | null
}

interface TaskItem {
  id: string
  type: string
  subject: string
  description?: string | null
  status: string
  dueAt?: string | Date | null
  dueTime?: string | null
  durationMin?: number | null
  createdAt: string | Date
  completedAt?: string | Date | null
  assignees: Assignee[]
  address?: { id: string; company: string; number: string } | null
  contact?: { id: string; firstName: string; lastName: string } | null
  inquiry?: { id: string; title: string; number: string } | null
}

interface TaskDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: TaskItem | null
  onEdit?: (task: TaskItem) => void
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || '\u2014'}</span>
    </div>
  )
}

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  onEdit,
}: TaskDetailDialogProps) {
  const t = useTranslations('crmTasks')

  const [confirmAction, setConfirmAction] = React.useState<'complete' | 'cancel' | 'reopen' | 'delete' | null>(null)

  const completeMutation = useCompleteCrmTask()
  const cancelMutation = useCancelCrmTask()
  const reopenMutation = useReopenCrmTask()
  const deleteMutation = useDeleteCrmTask()

  if (!task) return null

  const isOpenOrInProgress = task.status === 'OPEN' || task.status === 'IN_PROGRESS'
  const isCompletedOrCancelled = task.status === 'COMPLETED' || task.status === 'CANCELLED'

  const formatDate = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const handleConfirm = async () => {
    if (!confirmAction || !task) return
    try {
      switch (confirmAction) {
        case 'complete':
          await completeMutation.mutateAsync({ id: task.id })
          toast.success(t('complete'))
          break
        case 'cancel':
          await cancelMutation.mutateAsync({ id: task.id })
          toast.success(t('cancelTask'))
          break
        case 'reopen':
          await reopenMutation.mutateAsync({ id: task.id })
          toast.success(t('reopen'))
          break
        case 'delete':
          await deleteMutation.mutateAsync({ id: task.id })
          toast.success(t('delete'))
          onOpenChange(false)
          break
      }
      setConfirmAction(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error'
      toast.error(message)
      setConfirmAction(null)
    }
  }

  const confirmConfig: Record<string, { title: string; description: string; variant?: 'destructive' | 'default' }> = {
    complete: { title: t('completeTitle'), description: t('confirmComplete') },
    cancel: { title: t('cancelTitle'), description: t('confirmCancel') },
    reopen: { title: t('reopenTitle'), description: t('confirmReopen') },
    delete: { title: t('deleteTitle'), description: t('confirmDelete'), variant: 'destructive' },
  }

  const currentConfirm = confirmAction ? confirmConfig[confirmAction] : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <DialogTitle className="text-xl">{task.subject}</DialogTitle>
              <TaskTypeBadge type={task.type} />
              <TaskStatusBadge status={task.status} />
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Grunddaten */}
            <Card>
              <CardContent className="pt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('basicData')}</h3>
                <div className="divide-y">
                  <DetailRow label={t('subject')} value={task.subject} />
                  {task.description && (
                    <DetailRow label={t('description')} value={
                      <span className="whitespace-pre-wrap">{task.description}</span>
                    } />
                  )}
                  <DetailRow label={t('type')} value={task.type === 'TASK' ? t('typeTask') : t('typeMessage')} />
                  <DetailRow label={t('createdAt')} value={formatDate(task.createdAt)} />
                  {task.completedAt && (
                    <DetailRow label={t('completedAt')} value={formatDate(task.completedAt)} />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Verknupfungen */}
            {(task.address || task.contact || task.inquiry) && (
              <Card>
                <CardContent className="pt-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('links')}</h3>
                  <div className="divide-y">
                    {task.address && (
                      <DetailRow label={t('address')} value={`${task.address.number} \u2014 ${task.address.company}`} />
                    )}
                    {task.contact && (
                      <DetailRow label={t('contact')} value={`${task.contact.firstName} ${task.contact.lastName}`} />
                    )}
                    {task.inquiry && (
                      <DetailRow label={t('inquiry')} value={`${task.inquiry.number} \u2014 ${task.inquiry.title}`} />
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Terminierung (only for TASK) */}
            {task.type === 'TASK' && (task.dueAt || task.dueTime || task.durationMin) && (
              <Card>
                <CardContent className="pt-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('scheduling')}</h3>
                  <div className="divide-y">
                    {task.dueAt && <DetailRow label={t('dueDate')} value={formatDate(task.dueAt)} />}
                    {task.dueTime && <DetailRow label={t('dueTime')} value={task.dueTime} />}
                    {task.durationMin && <DetailRow label={t('duration')} value={`${task.durationMin} min`} />}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Zuweisungen */}
            <Card>
              <CardContent className="pt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('assigneesSection')}</h3>
                <div className="space-y-2">
                  {task.assignees.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 py-1">
                      {a.teamId ? (
                        <Users className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm flex-1">
                        {a.employee
                          ? `${a.employee.firstName} ${a.employee.lastName}`
                          : a.team
                            ? a.team.name
                            : '\u2014'}
                      </span>
                      {a.readAt ? (
                        <Badge variant="outline" className="gap-1 text-green-600">
                          <Check className="h-3 w-3" />
                          {t('readStatus')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Minus className="h-3 w-3" />
                          {t('unread')}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {isOpenOrInProgress && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmAction('complete')}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {t('complete')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmAction('cancel')}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  {t('cancelTask')}
                </Button>
              </>
            )}
            {isCompletedOrCancelled && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmAction('reopen')}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('reopen')}
              </Button>
            )}
            {onEdit && !isCompletedOrCancelled && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  onEdit(task)
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => setConfirmAction('delete')}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={currentConfirm?.title ?? ''}
        description={currentConfirm?.description ?? ''}
        confirmLabel={t('confirm')}
        onConfirm={handleConfirm}
        variant={currentConfirm?.variant === 'destructive' ? 'destructive' : undefined}
      />
    </>
  )
}
