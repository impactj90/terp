'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, UserX, X, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useEmployeeCappingExceptions,
  useCreateEmployeeCappingException,
  useUpdateEmployeeCappingException,
  useDeleteEmployeeCappingException,
  useVacationCappingRules,
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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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

type EmployeeCappingException = components['schemas']['EmployeeCappingException']
type VacationCappingRule = components['schemas']['VacationCappingRule']
type Employee = components['schemas']['Employee']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, any>) => string

interface FormState {
  employeeId: string
  cappingRuleId: string
  year: string
  exemptionType: 'full' | 'partial'
  retainDays: string
  notes: string
  isActive: boolean
}

const INITIAL_FORM: FormState = {
  employeeId: '',
  cappingRuleId: '',
  year: '',
  exemptionType: 'full',
  retainDays: '',
  notes: '',
  isActive: true,
}

export function EmployeeExceptionsTab() {
  const t = useTranslations('adminVacationConfig')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<EmployeeCappingException | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<EmployeeCappingException | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const { data: exceptionsData, isLoading } = useEmployeeCappingExceptions({
    enabled: !authLoading && isAdmin,
  })
  const deleteMutation = useDeleteEmployeeCappingException()
  const items = (exceptionsData?.data ?? []) as EmployeeCappingException[]

  // Lookup data
  const { data: employeesData } = useEmployees({ limit: 200, active: true, enabled: !authLoading && isAdmin })
  const employees = (employeesData?.data ?? []) as Employee[]
  const employeeMap = React.useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])

  const { data: cappingRulesData } = useVacationCappingRules({ enabled: !authLoading && isAdmin })
  const cappingRules = (cappingRulesData?.data ?? []) as VacationCappingRule[]
  const cappingRuleMap = React.useMemo(() => new Map(cappingRules.map((r) => [r.id, r])), [cappingRules])

  const filteredItems = React.useMemo(() => {
    if (!search) return items
    const s = search.toLowerCase()
    return items.filter((item) => {
      const emp = employeeMap.get(item.employee_id)
      const empName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : ''
      const rule = cappingRuleMap.get(item.capping_rule_id)
      const ruleName = rule ? rule.name.toLowerCase() : ''
      return empName.includes(s) || ruleName.includes(s) || (item.notes ?? '').toLowerCase().includes(s)
    })
  }, [items, search, employeeMap, cappingRuleMap])

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
      setDeleteItem(null)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      setDeleteError(apiError.detail ?? apiError.message ?? t('exception.failedDelete'))
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const hasFilters = Boolean(search)

  const getEmployeeName = (employeeId: string) => {
    const emp = employeeMap.get(employeeId)
    return emp ? `${emp.first_name} ${emp.last_name}` : employeeId
  }

  const getCappingRuleName = (ruleId: string) => {
    const rule = cappingRuleMap.get(ruleId)
    return rule ? rule.name : ruleId
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('exception.new')}
        </Button>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('exception.searchPlaceholder')}
          className="w-full sm:w-64"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
            <X className="mr-2 h-4 w-4" />
            {t('exception.clearFilters')}
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredItems.length === 1
          ? (t as TranslationFn)('exception.count', { count: filteredItems.length })
          : (t as TranslationFn)('exception.countPlural', { count: filteredItems.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><Skeleton className="h-64" /></div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 px-6">
              <UserX className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">{t('exception.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t('exception.emptyFilterHint') : t('exception.emptyGetStarted')}
              </p>
              {!hasFilters && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('exception.addNew')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('exception.columnEmployee')}</TableHead>
                  <TableHead>{t('exception.columnCappingRule')}</TableHead>
                  <TableHead>{t('exception.columnYear')}</TableHead>
                  <TableHead>{t('exception.columnExemptionType')}</TableHead>
                  <TableHead>{t('exception.columnRetainDays')}</TableHead>
                  <TableHead>{t('exception.columnStatus')}</TableHead>
                  <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{getEmployeeName(item.employee_id)}</TableCell>
                    <TableCell>{getCappingRuleName(item.capping_rule_id)}</TableCell>
                    <TableCell>{item.year ?? t('exception.yearAll')}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          item.exemption_type === 'full'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }
                      >
                        {item.exemption_type === 'full' ? t('exception.exemptionFull') : t('exception.exemptionPartial')}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.retain_days != null ? item.retain_days : '-'}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active ? t('exception.statusActive') : t('exception.statusInactive')}
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
                            {t('exception.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => { setDeleteItem(item); setDeleteError(null) }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('exception.delete')}
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

      <ExceptionFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditItem(null) } }}
        exception={editItem}
        onSuccess={handleFormSuccess}
      />

      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => { if (!open) { setDeleteItem(null); setDeleteError(null) } }}
        title={t('exception.deleteTitle')}
        description={deleteError ? deleteError : deleteItem ? t('exception.deleteDescription') : ''}
        confirmLabel={t('exception.delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

// ==================== Form Sheet ====================

interface ExceptionFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  exception?: EmployeeCappingException | null
  onSuccess?: () => void
}

function ExceptionFormSheet({ open, onOpenChange, exception, onSuccess }: ExceptionFormSheetProps) {
  const t = useTranslations('adminVacationConfig')
  const isEdit = !!exception
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateEmployeeCappingException()
  const updateMutation = useUpdateEmployeeCappingException()

  const { data: employeesData } = useEmployees({ limit: 200, active: true, enabled: open })
  const employees = (employeesData?.data ?? []) as Employee[]

  const { data: cappingRulesData } = useVacationCappingRules({ enabled: open })
  const cappingRules = (cappingRulesData?.data ?? []) as VacationCappingRule[]

  React.useEffect(() => {
    if (!open) return
    if (exception) {
      setForm({
        employeeId: exception.employee_id,
        cappingRuleId: exception.capping_rule_id,
        year: exception.year != null ? String(exception.year) : '',
        exemptionType: exception.exemption_type,
        retainDays: exception.retain_days != null ? String(exception.retain_days) : '',
        notes: exception.notes ?? '',
        isActive: exception.is_active ?? true,
      })
    } else {
      setForm(INITIAL_FORM)
    }
    setError(null)
  }, [open, exception])

  const handleSubmit = async () => {
    setError(null)
    const errors: string[] = []
    if (!form.employeeId) errors.push(t('exception.validationEmployeeRequired'))
    if (!form.cappingRuleId) errors.push(t('exception.validationCappingRuleRequired'))
    if (form.exemptionType === 'partial' && !form.retainDays) {
      errors.push(t('exception.validationRetainDaysRequired'))
    }

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    const year = form.year ? parseInt(form.year, 10) : undefined
    const retainDays = form.retainDays ? parseFloat(form.retainDays) : undefined

    try {
      if (isEdit && exception) {
        await updateMutation.mutateAsync({
          path: { id: exception.id },
          body: {
            exemption_type: form.exemptionType,
            retain_days: form.exemptionType === 'partial' ? retainDays : undefined,
            year,
            notes: form.notes.trim() || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            employee_id: form.employeeId,
            capping_rule_id: form.cappingRuleId,
            exemption_type: form.exemptionType,
            retain_days: form.exemptionType === 'partial' ? retainDays : undefined,
            year,
            notes: form.notes.trim() || undefined,
          },
        })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? (isEdit ? t('exception.failedUpdate') : t('exception.failedCreate')))
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('exception.edit') : t('exception.new')}</SheetTitle>
          <SheetDescription>{isEdit ? t('exception.editDescription') : t('exception.createDescription')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('exception.sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="employeeId">{t('exception.fieldEmployee')} *</Label>
                <Select
                  value={form.employeeId || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, employeeId: value === '__none__' ? '' : value }))}
                  disabled={isSubmitting || isEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('exception.selectEmployee')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('exception.selectEmployee')}</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.personnel_number} - {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cappingRuleId">{t('exception.fieldCappingRule')} *</Label>
                <Select
                  value={form.cappingRuleId || '__none__'}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, cappingRuleId: value === '__none__' ? '' : value }))}
                  disabled={isSubmitting || isEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('exception.selectCappingRule')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('exception.selectCappingRule')}</SelectItem>
                    {cappingRules.map((rule) => (
                      <SelectItem key={rule.id} value={rule.id}>
                        [{rule.code}] {rule.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="year">{t('exception.fieldYear')}</Label>
                <Input
                  id="year"
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
                  disabled={isSubmitting}
                  min={2000}
                  max={2100}
                  placeholder=""
                />
                <p className="text-xs text-muted-foreground">{t('exception.fieldYearHint')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('exception.sectionDetails')}</h3>

              <div className="space-y-2">
                <Label htmlFor="exemptionType">{t('exception.fieldExemptionType')} *</Label>
                <Select
                  value={form.exemptionType}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, exemptionType: value as 'full' | 'partial' }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">{t('exception.exemptionFull')}</SelectItem>
                    <SelectItem value="partial">{t('exception.exemptionPartial')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.exemptionType === 'partial' && (
                <div className="space-y-2">
                  <Label htmlFor="retainDays">{t('exception.fieldRetainDays')} *</Label>
                  <Input
                    id="retainDays"
                    type="number"
                    value={form.retainDays}
                    onChange={(e) => setForm((prev) => ({ ...prev, retainDays: e.target.value }))}
                    disabled={isSubmitting}
                    min={0}
                    step={0.5}
                  />
                  <p className="text-xs text-muted-foreground">{t('exception.retainDaysHint')}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">{t('exception.fieldNotes')}</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>

            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('exception.sectionStatus')}</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('exception.fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">{t('exception.fieldActiveDescription')}</p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="flex-1">
            {t('exception.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('exception.saving') : isEdit ? t('exception.saveChanges') : t('exception.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
