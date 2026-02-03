'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronUp, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useApiQuery } from '@/hooks'
import {
  useCreateUser,
  useUpdateUser,
  useUserGroups,
  useEmployees,
  useDepartments,
} from '@/hooks/api'
import type { components } from '@/lib/api/types'

type User = components['schemas']['User']

interface UserFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: User | null
  onSuccess?: () => void
}

interface FormState {
  email: string
  username: string
  displayName: string
  password: string
  userGroupId: string
  employeeId: string
  isActive: boolean
  isLocked: boolean
  dataScopeType: string
  dataScopeTenantIds: string[]
  dataScopeDepartmentIds: string[]
  dataScopeEmployeeIds: string[]
}

const INITIAL_STATE: FormState = {
  email: '',
  username: '',
  displayName: '',
  password: '',
  userGroupId: '',
  employeeId: '',
  isActive: true,
  isLocked: false,
  dataScopeType: 'all',
  dataScopeTenantIds: [],
  dataScopeDepartmentIds: [],
  dataScopeEmployeeIds: [],
}

function validateForm(form: FormState, isEdit: boolean): string[] {
  const errorKeys: string[] = []
  if (!isEdit && !form.email.trim()) errorKeys.push('validationEmailRequired')
  if (!isEdit && form.email && !form.email.includes('@')) errorKeys.push('validationEmailInvalid')
  if (!form.displayName.trim()) errorKeys.push('validationDisplayNameRequired')
  if (form.displayName.trim().length > 0 && form.displayName.trim().length < 2)
    errorKeys.push('validationDisplayNameMinLength')
  if (form.displayName.trim().length > 255) errorKeys.push('validationDisplayNameMaxLength')
  if (!isEdit && !form.password.trim()) errorKeys.push('validationPasswordRequired')
  if (form.password && form.password.length < 8) errorKeys.push('validationPasswordMinLength')
  return errorKeys
}

export function UserFormSheet({ open, onOpenChange, user, onSuccess }: UserFormSheetProps) {
  const t = useTranslations('adminUsers')
  const tCommon = useTranslations('common')
  const isEdit = !!user

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [showPassword, setShowPassword] = React.useState(false)
  const [showDataScope, setShowDataScope] = React.useState(false)

  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()

  // Reference data
  const { data: groupsData } = useUserGroups({ enabled: open })
  const { data: employeesData } = useEmployees({ limit: 100, enabled: open })
  const { data: tenantsData } = useApiQuery('/tenants', {
    enabled: open && form.dataScopeType === 'tenant',
  })
  const { data: departmentsData } = useDepartments({
    enabled: open && form.dataScopeType === 'department',
  })
  const { data: scopeEmployeesData } = useEmployees({
    limit: 100,
    enabled: open && form.dataScopeType === 'employee',
  })

  const groups = groupsData?.data ?? []
  const employees = employeesData?.data ?? []
  const tenants = tenantsData ?? []
  const departments = departmentsData?.data ?? []
  const scopeEmployees = scopeEmployeesData?.data ?? []

  // Reset form when opening/closing or user changes
  React.useEffect(() => {
    if (!open) return

    if (user) {
      setForm({
        email: user.email ?? '',
        username: user.username ?? '',
        displayName: user.display_name ?? '',
        password: '',
        userGroupId: user.user_group_id ?? '',
        employeeId: user.employee_id ?? '',
        isActive: user.is_active ?? true,
        isLocked: user.is_locked ?? false,
        dataScopeType: user.data_scope_type ?? 'all',
        dataScopeTenantIds: user.data_scope_tenant_ids ?? [],
        dataScopeDepartmentIds: user.data_scope_department_ids ?? [],
        dataScopeEmployeeIds: user.data_scope_employee_ids ?? [],
      })
      setShowDataScope((user.data_scope_type ?? 'all') !== 'all')
    } else {
      setForm(INITIAL_STATE)
      setShowDataScope(false)
    }

    setError(null)
    setShowPassword(false)
  }, [open, user])

  const handleSubmit = async () => {
    setError(null)

    const errorKeys = validateForm(form, isEdit)
    if (errorKeys.length > 0) {
      setError(errorKeys.map((key) => t(key as Parameters<typeof t>[0])).join('. '))
      return
    }

    try {
      if (isEdit && user) {
        await updateMutation.mutateAsync({
          path: { id: user.id },
          body: {
            display_name: form.displayName.trim(),
            username: form.username.trim() || undefined,
            user_group_id: form.userGroupId,
            employee_id: form.employeeId,
            is_active: form.isActive,
            is_locked: form.isLocked,
            data_scope_type: form.dataScopeType as
              | 'all'
              | 'tenant'
              | 'department'
              | 'employee',
            data_scope_tenant_ids:
              form.dataScopeType === 'tenant' ? form.dataScopeTenantIds : undefined,
            data_scope_department_ids:
              form.dataScopeType === 'department' ? form.dataScopeDepartmentIds : undefined,
            data_scope_employee_ids:
              form.dataScopeType === 'employee' ? form.dataScopeEmployeeIds : undefined,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            email: form.email.trim(),
            display_name: form.displayName.trim(),
            password: form.password,
            username: form.username.trim() || undefined,
            user_group_id: form.userGroupId || undefined,
            employee_id: form.employeeId || undefined,
            is_active: form.isActive,
            is_locked: form.isLocked,
            data_scope_type: form.dataScopeType as
              | 'all'
              | 'tenant'
              | 'department'
              | 'employee',
            data_scope_tenant_ids:
              form.dataScopeType === 'tenant' ? form.dataScopeTenantIds : undefined,
            data_scope_department_ids:
              form.dataScopeType === 'department' ? form.dataScopeDepartmentIds : undefined,
            data_scope_employee_ids:
              form.dataScopeType === 'employee' ? form.dataScopeEmployeeIds : undefined,
          },
        })
      }

      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? (isEdit ? t('failedUpdate') : t('failedCreate'))
      )
    }
  }

  const toggleScopeId = (
    field: 'dataScopeTenantIds' | 'dataScopeDepartmentIds' | 'dataScopeEmployeeIds',
    id: string
  ) => {
    setForm((prev) => {
      const current = new Set(prev[field])
      if (current.has(id)) {
        current.delete(id)
      } else {
        current.add(id)
      }
      return { ...prev, [field]: Array.from(current) }
    })
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex h-full flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editUser') : t('newUser')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Section: Account Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('sectionAccount')}
              </h3>

              <div className="space-y-2">
                <Label htmlFor="email">{t('fieldEmail')} {!isEdit && '*'}</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={isSubmitting || isEdit}
                  placeholder={t('placeholderEmail')}
                />
                {isEdit && (
                  <p className="text-xs text-muted-foreground">{t('emailCannotBeChanged')}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">{t('fieldUsername')}</Label>
                <Input
                  id="username"
                  value={form.username}
                  onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('placeholderUsername')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">{t('fieldDisplayName')} *</Label>
                <Input
                  id="displayName"
                  value={form.displayName}
                  onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('placeholderDisplayName')}
                  maxLength={255}
                />
              </div>

              {!isEdit && (
                <div className="space-y-2">
                  <Label htmlFor="password">{t('fieldPassword')} *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      disabled={isSubmitting}
                      placeholder={t('placeholderPassword')}
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
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Section: Assignment */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('sectionAssignment')}
              </h3>

              <div className="space-y-2">
                <Label>{t('fieldUserGroup')}</Label>
                <Select
                  value={form.userGroupId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      userGroupId: value === '__none__' ? '' : value,
                    }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectUserGroup')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('noUserGroup')}</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('fieldEmployeeLink')}</Label>
                <Select
                  value={form.employeeId || '__none__'}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      employeeId: value === '__none__' ? '' : value,
                    }))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectEmployee')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('noEmployee')}</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.personnel_number} - {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Section: Status (edit only) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('sectionStatus')}
                </h3>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive" className="text-sm">
                      {t('fieldActive')}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('fieldActiveDescription')}</p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    disabled={isSubmitting}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="isLocked" className="text-sm">
                      {t('fieldLocked')}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('fieldLockedDescription')}</p>
                  </div>
                  <Switch
                    id="isLocked"
                    checked={form.isLocked}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isLocked: checked }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )}

            {/* Section: Data Scope (collapsible) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('sectionDataScope')}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDataScope(!showDataScope)}
                >
                  {showDataScope ? (
                    <ChevronUp className="mr-1 h-4 w-4" />
                  ) : (
                    <ChevronDown className="mr-1 h-4 w-4" />
                  )}
                  {showDataScope ? t('hideDataScope') : t('showDataScope')}
                </Button>
              </div>

              {showDataScope && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">{t('scopeHint')}</p>

                  <div className="space-y-2">
                    <Label>{t('fieldDataScopeType')}</Label>
                    <Select
                      value={form.dataScopeType}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          dataScopeType: value,
                          dataScopeTenantIds: [],
                          dataScopeDepartmentIds: [],
                          dataScopeEmployeeIds: [],
                        }))
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('selectScopeType')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('scopeAll')}</SelectItem>
                        <SelectItem value="tenant">{t('scopeTenant')}</SelectItem>
                        <SelectItem value="department">{t('scopeDepartment')}</SelectItem>
                        <SelectItem value="employee">{t('scopeEmployee')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tenant scope IDs */}
                  {form.dataScopeType === 'tenant' && (
                    <div className="space-y-2">
                      <Label>{t('fieldDataScopeIds')}</Label>
                      <p className="text-xs text-muted-foreground">{t('scopeIdsHint')}</p>
                      <div className="max-h-48 overflow-y-auto rounded-lg border p-3 space-y-2">
                        {tenants.map((tenant) => (
                          <label
                            key={tenant.id}
                            htmlFor={`scope-tenant-${tenant.id}`}
                            className="flex items-center gap-3 rounded-md p-2 transition hover:bg-muted/50"
                          >
                            <Checkbox
                              id={`scope-tenant-${tenant.id}`}
                              checked={form.dataScopeTenantIds.includes(tenant.id)}
                              onCheckedChange={() =>
                                toggleScopeId('dataScopeTenantIds', tenant.id)
                              }
                              disabled={isSubmitting}
                            />
                            <span className="text-sm">{tenant.name}</span>
                          </label>
                        ))}
                        {tenants.length === 0 && (
                          <p className="text-sm text-muted-foreground py-2">{tCommon('noData')}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Department scope IDs */}
                  {form.dataScopeType === 'department' && (
                    <div className="space-y-2">
                      <Label>{t('fieldDataScopeIds')}</Label>
                      <p className="text-xs text-muted-foreground">{t('scopeIdsHint')}</p>
                      <div className="max-h-48 overflow-y-auto rounded-lg border p-3 space-y-2">
                        {departments.map((dept) => (
                          <label
                            key={dept.id}
                            htmlFor={`scope-dept-${dept.id}`}
                            className="flex items-center gap-3 rounded-md p-2 transition hover:bg-muted/50"
                          >
                            <Checkbox
                              id={`scope-dept-${dept.id}`}
                              checked={form.dataScopeDepartmentIds.includes(dept.id)}
                              onCheckedChange={() =>
                                toggleScopeId('dataScopeDepartmentIds', dept.id)
                              }
                              disabled={isSubmitting}
                            />
                            <span className="text-sm">{dept.name}</span>
                          </label>
                        ))}
                        {departments.length === 0 && (
                          <p className="text-sm text-muted-foreground py-2">{tCommon('noData')}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Employee scope IDs */}
                  {form.dataScopeType === 'employee' && (
                    <div className="space-y-2">
                      <Label>{t('fieldDataScopeIds')}</Label>
                      <p className="text-xs text-muted-foreground">{t('scopeIdsHint')}</p>
                      <div className="max-h-48 overflow-y-auto rounded-lg border p-3 space-y-2">
                        {scopeEmployees.map((emp) => (
                          <label
                            key={emp.id}
                            htmlFor={`scope-emp-${emp.id}`}
                            className="flex items-center gap-3 rounded-md p-2 transition hover:bg-muted/50"
                          >
                            <Checkbox
                              id={`scope-emp-${emp.id}`}
                              checked={form.dataScopeEmployeeIds.includes(emp.id)}
                              onCheckedChange={() =>
                                toggleScopeId('dataScopeEmployeeIds', emp.id)
                              }
                              disabled={isSubmitting}
                            />
                            <span className="text-sm">
                              {emp.personnel_number} - {emp.first_name} {emp.last_name}
                            </span>
                          </label>
                        ))}
                        {scopeEmployees.length === 0 && (
                          <p className="text-sm text-muted-foreground py-2">{tCommon('noData')}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('createUser')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
