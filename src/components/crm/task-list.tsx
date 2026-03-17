'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Plus,
  Eye,
  Search,
  ClipboardCheck,
  MessageSquare,
  CheckCircle,
} from 'lucide-react'
import {
  useCrmTasks,
  useMyTasks,
  useDeleteCrmTask,
  useCompleteCrmTask,
} from '@/hooks'
import { TaskStatusBadge } from './task-status-badge'
import { TaskFormSheet } from './task-form-sheet'
import { TaskDetailDialog } from './task-detail-dialog'
import { toast } from 'sonner'

interface TaskListProps {
  addressId?: string
  inquiryId?: string
}

type TaskItem = {
  id: string
  type: string
  subject: string
  status: string
  description?: string | null
  dueAt?: string | Date | null
  dueTime?: string | null
  durationMin?: number | null
  addressId?: string | null
  contactId?: string | null
  inquiryId?: string | null
  completedAt?: string | null
  createdAt: Date | string
  assignees: Array<{
    id: string
    employeeId?: string | null
    teamId?: string | null
    readAt?: string | null
    employee?: { id: string; firstName: string; lastName: string } | null
    team?: { id: string; name: string } | null
  }>
  address?: { id: string; company: string; number: string } | null
  contact?: { id: string; firstName: string; lastName: string } | null
  inquiry?: { id: string; title: string; number: string } | null
}

export function TaskList({ addressId, inquiryId }: TaskListProps) {
  const t = useTranslations('crmTasks')

  // Filter state
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [myTasksMode, setMyTasksMode] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const pageSize = 25

  // Dialog state
  const [formOpen, setFormOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Record<string, unknown> | null>(null)
  const [detailItem, setDetailItem] = React.useState<TaskItem | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<{ id: string; subject: string } | null>(null)

  const statusValue = statusFilter !== 'all' ? (statusFilter as "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED") : undefined
  const typeValue = typeFilter !== 'all' ? (typeFilter as "TASK" | "MESSAGE") : undefined

  // Data fetching
  const allTasksQuery = useCrmTasks({
    enabled: !myTasksMode,
    addressId,
    inquiryId,
    search: search || undefined,
    status: statusValue,
    type: typeValue,
    page,
    pageSize,
  })

  const myTasksQuery = useMyTasks({
    enabled: myTasksMode,
    status: statusValue,
    type: typeValue,
    page,
    pageSize,
  })

  const { data, isLoading } = myTasksMode ? myTasksQuery : allTasksQuery

  const deleteMutation = useDeleteCrmTask()
  const completeMutation = useCompleteCrmTask()

  const handleDelete = async () => {
    if (!deleteItem) return
    try {
      await deleteMutation.mutateAsync({ id: deleteItem.id })
      setDeleteItem(null)
      toast.success(t('deleteTitle'))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error'
      toast.error(message)
    }
  }

  const handleComplete = async (id: string) => {
    try {
      await completeMutation.mutateAsync({ id })
      toast.success(t('complete'))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error'
      toast.error(message)
    }
  }

  const handleEdit = (item: TaskItem) => {
    setEditItem(item as unknown as Record<string, unknown>)
    setFormOpen(true)
  }

  const handleCreate = () => {
    setEditItem(null)
    setFormOpen(true)
  }

  const items = (data?.items ?? []) as TaskItem[]
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const formatDate = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return '\u2014'
    const d = new Date(dateStr)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const getAssigneeNames = (item: TaskItem) => {
    return item.assignees
      .map((a) =>
        a.employee
          ? `${a.employee.firstName} ${a.employee.lastName}`
          : a.team
            ? a.team.name
            : ''
      )
      .filter(Boolean)
      .join(', ')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t('title')}</h3>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newTask')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatus')}</SelectItem>
            <SelectItem value="OPEN">{t('statusOpen')}</SelectItem>
            <SelectItem value="IN_PROGRESS">{t('statusInProgress')}</SelectItem>
            <SelectItem value="COMPLETED">{t('statusCompleted')}</SelectItem>
            <SelectItem value="CANCELLED">{t('statusCancelled')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allTypes')}</SelectItem>
            <SelectItem value="TASK">{t('typeTask')}</SelectItem>
            <SelectItem value="MESSAGE">{t('typeMessage')}</SelectItem>
          </SelectContent>
        </Select>
        {!addressId && !inquiryId && (
          <Button
            variant={myTasksMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setMyTasksMode(!myTasksMode)
              setPage(1)
            }}
          >
            {myTasksMode ? t('allTasks') : t('myTasks')}
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{t('noEntries')}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t('type')}</TableHead>
                <TableHead>{t('subject')}</TableHead>
                <TableHead>{t('assignees')}</TableHead>
                <TableHead>{t('dueDate')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">{t('actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => setDetailItem(item)}
                >
                  <TableCell>
                    {item.type === 'TASK' ? (
                      <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-[300px] truncate">
                    {item.subject}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {getAssigneeNames(item) || '\u2014'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {item.type === 'TASK' ? formatDate(item.dueAt) : '\u2014'}
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetailItem(item)
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {t('view')}
                        </DropdownMenuItem>
                        {item.status !== 'COMPLETED' && item.status !== 'CANCELLED' && (
                          <>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(item)
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              {t('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleComplete(item.id)
                              }}
                            >
                              <CheckCircle className="mr-2 h-4 w-4" />
                              {t('complete')}
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteItem({ id: item.id, subject: item.subject })
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                &lt;
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                &gt;
              </Button>
            </div>
          )}
        </>
      )}

      {/* Form Sheet */}
      <TaskFormSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false)
            setEditItem(null)
          }
        }}
        addressId={addressId}
        inquiryId={inquiryId}
        editItem={editItem}
      />

      {/* Detail Dialog */}
      <TaskDetailDialog
        open={!!detailItem}
        onOpenChange={(open) => !open && setDetailItem(null)}
        task={detailItem}
        onEdit={(task) => handleEdit(task as unknown as TaskItem)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => !open && setDeleteItem(null)}
        title={t('deleteTitle')}
        description={t('confirmDelete')}
        confirmLabel={t('confirm')}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  )
}
