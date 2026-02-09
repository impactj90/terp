'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Users, X, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useEmployeeAccessAssignments,
  useCreateEmployeeAccessAssignment,
  useUpdateEmployeeAccessAssignment,
  useDeleteEmployeeAccessAssignment,
  useAccessProfiles,
  useEmployees,
} from '@/hooks/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SearchInput } from '@/components/ui/search-input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { components } from '@/lib/api/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, any>) => string

type EmployeeAccessAssignment = components['schemas']['EmployeeAccessAssignment']

export function AssignmentsTab() {
  const t = useTranslations('adminAccessControl')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  // Filter state
  const [search, setSearch] = React.useState('')
  const [profileFilter, setProfileFilter] = React.useState<string>('all')

  // CRUD state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<EmployeeAccessAssignment | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<EmployeeAccessAssignment | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  // Data
  const { data: assignmentData, isLoading } = useEmployeeAccessAssignments({
    enabled: !authLoading && isAdmin,
  })
  const { data: profilesData } = useAccessProfiles({
    enabled: !authLoading && isAdmin,
  })
  const { data: employeesData } = useEmployees({
    active: true,
    enabled: !authLoading && isAdmin,
  })
  const deleteMutation = useDeleteEmployeeAccessAssignment()

  const items = (assignmentData?.data ?? []) as EmployeeAccessAssignment[]
  const profiles = profilesData?.data ?? []
  const employees = employeesData?.data ?? []

  // Build lookup maps
  const profileMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const p of profiles) {
      map.set(p.id, p.name)
    }
    return map
  }, [profiles])

  const employeeMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const e of employees) {
      map.set(e.id, `${e.first_name} ${e.last_name}`)
    }
    return map
  }, [employees])

  // Filtering
  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      if (profileFilter !== 'all' && item.access_profile_id !== profileFilter) return false
      if (search) {
        const s = search.toLowerCase()
        const empName = employeeMap.get(item.employee_id) ?? ''
        const profName = profileMap.get(item.access_profile_id) ?? ''
        if (
          !empName.toLowerCase().includes(s) &&
          !profName.toLowerCase().includes(s)
        ) {
          return false
        }
      }
      return true
    })
  }, [items, search, profileFilter, employeeMap, profileMap])

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
      setDeleteItem(null)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      setDeleteError(apiError.detail ?? apiError.message ?? t('assignments.delete'))
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const hasFilters = Boolean(search) || profileFilter !== 'all'

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('assignments.new')}
        </Button>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('assignments.searchPlaceholder')}
          className="w-full sm:w-64"
        />

        <Select
          value={profileFilter}
          onValueChange={setProfileFilter}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('assignments.allProfiles')}</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setProfileFilter('all')
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('assignments.clearFilters')}
          </Button>
        )}
      </div>

      {/* Count */}
      <div className="text-sm text-muted-foreground">
        {filteredItems.length === 1
          ? (t as TranslationFn)('assignments.count', { count: filteredItems.length })
          : (t as TranslationFn)('assignments.countPlural', { count: filteredItems.length })}
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Users className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">{t('assignments.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t('assignments.emptyFilterHint') : t('assignments.emptyGetStarted')}
              </p>
              {!hasFilters && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('assignments.new')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('assignments.columnEmployee')}</TableHead>
                  <TableHead>{t('assignments.columnProfile')}</TableHead>
                  <TableHead>{t('assignments.columnValidFrom')}</TableHead>
                  <TableHead>{t('assignments.columnValidTo')}</TableHead>
                  <TableHead>{t('assignments.columnActive')}</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{employeeMap.get(item.employee_id) ?? '-'}</TableCell>
                    <TableCell>{profileMap.get(item.access_profile_id) ?? '-'}</TableCell>
                    <TableCell>
                      {item.valid_from
                        ? format(new Date(item.valid_from), 'dd.MM.yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {item.valid_to
                        ? format(new Date(item.valid_to), 'dd.MM.yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active
                          ? t('assignments.statusActive')
                          : t('assignments.statusInactive')}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditItem(item)}>
                            <Edit className="mr-2 h-4 w-4" />
                            {t('assignments.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              setDeleteItem(item)
                              setDeleteError(null)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('assignments.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <AssignmentFormDialog
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        assignment={editItem}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteItem(null)
            setDeleteError(null)
          }
        }}
        title={t('assignments.deleteTitle')}
        description={
          deleteError
            ? deleteError
            : t('assignments.deleteDescription')
        }
        confirmLabel={t('assignments.delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

// ==================== Form Dialog ====================

interface AssignmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment?: EmployeeAccessAssignment | null
  onSuccess?: () => void
}

interface AssignmentFormState {
  employeeId: string
  accessProfileId: string
  validFrom: string
  validTo: string
  isActive: boolean
}

const INITIAL_ASSIGNMENT_FORM: AssignmentFormState = {
  employeeId: '',
  accessProfileId: '',
  validFrom: '',
  validTo: '',
  isActive: true,
}

function AssignmentFormDialog({
  open,
  onOpenChange,
  assignment,
  onSuccess,
}: AssignmentFormDialogProps) {
  const t = useTranslations('adminAccessControl')
  const isEdit = !!assignment
  const [form, setForm] = React.useState<AssignmentFormState>(INITIAL_ASSIGNMENT_FORM)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateEmployeeAccessAssignment()
  const updateMutation = useUpdateEmployeeAccessAssignment()
  const { data: employeesData } = useEmployees({ active: true, enabled: open })
  const { data: profilesData } = useAccessProfiles({ enabled: open })
  const employees = employeesData?.data ?? []
  const profiles = profilesData?.data ?? []

  React.useEffect(() => {
    if (open) {
      if (assignment) {
        setForm({
          employeeId: assignment.employee_id || '',
          accessProfileId: assignment.access_profile_id || '',
          validFrom: assignment.valid_from?.split('T')[0] || '',
          validTo: assignment.valid_to?.split('T')[0] || '',
          isActive: assignment.is_active ?? true,
        })
      } else {
        setForm(INITIAL_ASSIGNMENT_FORM)
      }
      setError(null)
    }
  }, [open, assignment])

  const handleSave = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.employeeId) errors.push(t('assignments.validationEmployeeRequired'))
    if (!form.accessProfileId) errors.push(t('assignments.validationProfileRequired'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && assignment) {
        await updateMutation.mutateAsync({
          path: { id: assignment.id },
          body: {
            valid_from: form.validFrom || undefined,
            valid_to: form.validTo || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            employee_id: form.employeeId,
            access_profile_id: form.accessProfileId,
            valid_from: form.validFrom || undefined,
            valid_to: form.validTo || undefined,
          },
        })
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? (isEdit ? t('assignments.failedUpdate') : t('assignments.failedCreate')))
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('assignments.edit') : t('assignments.new')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('assignments.fieldEmployee')} *</Label>
            <Select
              value={form.employeeId || '__none__'}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, employeeId: value === '__none__' ? '' : value }))
              }
              disabled={isPending || isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('assignments.selectEmployee')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('assignments.selectEmployee')}</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.personnel_number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('assignments.fieldProfile')} *</Label>
            <Select
              value={form.accessProfileId || '__none__'}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, accessProfileId: value === '__none__' ? '' : value }))
              }
              disabled={isPending || isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('assignments.selectProfile')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('assignments.selectProfile')}</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('assignments.fieldValidFrom')}</Label>
              <Input
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('assignments.fieldValidTo')}</Label>
              <Input
                type="date"
                value={form.validTo}
                onChange={(e) => setForm((prev) => ({ ...prev, validTo: e.target.value }))}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Active toggle (edit only) */}
          {isEdit && (
            <div className="flex items-center justify-between">
              <Label htmlFor="assignmentActive">{t('assignments.fieldActive')}</Label>
              <Switch
                id="assignmentActive"
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, isActive: checked }))
                }
                disabled={isPending}
              />
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t('assignments.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('assignments.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
