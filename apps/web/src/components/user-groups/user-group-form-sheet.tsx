'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { useCreateUserGroup, usePermissions, useUpdateUserGroup } from '@/hooks/api'
import type { components } from '@/lib/api/types'

const CATEGORY_DEFINITIONS = [
  { id: 'employees', labelKey: 'categoryEmployees', resources: ['employees'] },
  { id: 'timeTracking', labelKey: 'categoryTimeTracking', resources: ['time_tracking'] },
  { id: 'bookingOverview', labelKey: 'categoryBookingOverview', resources: ['booking_overview'] },
  { id: 'absences', labelKey: 'categoryAbsences', resources: ['absences', 'absence_types'] },
  {
    id: 'configuration',
    labelKey: 'categoryConfiguration',
    resources: [
      'day_plans',
      'week_plans',
      'tariffs',
      'booking_types',
      'holidays',
      'departments',
      'teams',
      'accounts',
    ],
  },
  {
    id: 'admin',
    labelKey: 'categoryAdmin',
    resources: ['users', 'tenants', 'settings', 'notifications'],
  },
  { id: 'reports', labelKey: 'categoryReports', resources: ['reports'] },
] as const

type UserGroup = components['schemas']['UserGroup']

type Permission = components['schemas']['Permission']

type PermissionCategory = {
  id: string
  label: string
  permissions: Permission[]
}

interface UserGroupFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: UserGroup | null
  onSuccess?: () => void
}

interface FormState {
  code: string
  name: string
  description: string
  isAdmin: boolean
  isActive: boolean
  permissionIds: string[]
}

const INITIAL_STATE: FormState = {
  code: '',
  name: '',
  description: '',
  isAdmin: false,
  isActive: true,
  permissionIds: [],
}

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

export function UserGroupFormSheet({
  open,
  onOpenChange,
  group,
  onSuccess,
}: UserGroupFormSheetProps) {
  const t = useTranslations('adminUserGroups')
  const isEdit = !!group
  const isSystem = group?.is_system ?? false

  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set())

  const { data: permissionsData, isLoading: permissionsLoading } = usePermissions(open)
  const permissions = permissionsData?.data ?? []

  const createMutation = useCreateUserGroup()
  const updateMutation = useUpdateUserGroup()

  React.useEffect(() => {
    if (!open) return

    if (group) {
      setForm({
        code: group.code ?? '',
        name: group.name ?? '',
        description: group.description ?? '',
        isAdmin: group.is_admin ?? false,
        isActive: group.is_active ?? true,
        permissionIds: group.permissions?.map((permission) => permission.id) ?? [],
      })
    } else {
      setForm(INITIAL_STATE)
    }

    setError(null)
    setExpandedCategories(new Set())
  }, [open, group])

  const resourceLabels = React.useMemo<Record<string, string>>(
    () => ({
      employees: t('resourceEmployees'),
      time_tracking: t('resourceTimeTracking'),
      booking_overview: t('resourceBookingOverview'),
      absences: t('resourceAbsences'),
      absence_types: t('resourceAbsenceTypes'),
      day_plans: t('resourceDayPlans'),
      week_plans: t('resourceWeekPlans'),
      tariffs: t('resourceTariffs'),
      booking_types: t('resourceBookingTypes'),
      holidays: t('resourceHolidays'),
      departments: t('resourceDepartments'),
      teams: t('resourceTeams'),
      accounts: t('resourceAccounts'),
      users: t('resourceUsers'),
      tenants: t('resourceTenants'),
      settings: t('resourceSettings'),
      notifications: t('resourceNotifications'),
      reports: t('resourceReports'),
    }),
    [t]
  )

  const actionLabels = React.useMemo<Record<string, string>>(
    () => ({
      read: t('actionView'),
      create: t('actionCreate'),
      update: t('actionEdit'),
      delete: t('actionDelete'),
      manage: t('actionManage'),
      view_own: t('actionViewOwn'),
      view_all: t('actionViewAll'),
      approve: t('actionApprove'),
      request: t('actionRequest'),
      change_day_plan: t('actionChangeDayPlan'),
      calculate_day: t('actionCalculateDay'),
      calculate_month: t('actionCalculateMonth'),
      delete_bookings: t('actionDeleteBookings'),
    }),
    [t]
  )

  const permissionCategories = React.useMemo((): PermissionCategory[] => {
    const categories = CATEGORY_DEFINITIONS.map((category) => ({
      id: category.id,
      label: t(category.labelKey as Parameters<typeof t>[0]),
      permissions: [] as Permission[],
    }))

    const resourceToCategory = new Map<string, string>(
      CATEGORY_DEFINITIONS.flatMap((category) =>
        category.resources.map((resource) => [resource, category.id] as [string, string])
      )
    )

    permissions.forEach((permission) => {
      const categoryId = resourceToCategory.get(permission.resource)
      const target = categories.find((cat) => cat.id === categoryId)
      if (target) {
        target.permissions.push(permission)
      }
    })

    return categories.filter((category) => category.permissions.length > 0)
  }, [permissions, t])

  const formatPermissionTitle = React.useCallback(
    (permission: Permission) => {
      const actionKey = permission.action ?? ''
      const resourceKey = permission.resource ?? ''
      const actionLabel = actionLabels[actionKey] ?? toTitleCase(actionKey)
      const resourceLabel = resourceLabels[resourceKey] ?? toTitleCase(resourceKey)
      return `${actionLabel} ${resourceLabel}`
    },
    [actionLabels, resourceLabels]
  )

  const togglePermission = (permissionId: string) => {
    setForm((prev) => {
      const next = new Set(prev.permissionIds)
      if (next.has(permissionId)) {
        next.delete(permissionId)
      } else {
        next.add(permissionId)
      }
      return { ...prev, permissionIds: Array.from(next) }
    })
  }

  const toggleCategoryDetails = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const toggleCategorySelection = (category: PermissionCategory) => {
    setForm((prev) => {
      const next = new Set(prev.permissionIds)
      const categoryIds = category.permissions.map((permission) => permission.id)
      const allSelected = categoryIds.every((id) => next.has(id))

      if (allSelected) {
        categoryIds.forEach((id) => next.delete(id))
      } else {
        categoryIds.forEach((id) => next.add(id))
      }

      return { ...prev, permissionIds: Array.from(next) }
    })
  }

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.name.trim()) errors.push(t('validationNameRequired'))
    else if (form.name.trim().length > 255) errors.push(t('validationNameMaxLength'))

    if (!isEdit) {
      if (!form.code.trim()) errors.push(t('validationCodeRequired'))
      else if (form.code.trim().length > 50) errors.push(t('validationCodeMaxLength'))
    }

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && group) {
        await updateMutation.mutateAsync({
          path: { id: group.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            is_admin: form.isAdmin,
            is_active: form.isActive,
            permission_ids: form.permissionIds,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            is_admin: form.isAdmin,
            permission_ids: form.permissionIds,
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

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex h-full flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('editGroup') : t('newGroup')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('editDescription') : t('createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {isSystem && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{t('systemGroupWarning')}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionBasicInfo')}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">{t('fieldCode')} *</Label>
                  <Input
                    id="code"
                    value={form.code}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
                    }
                    disabled={isSubmitting || isSystem || isEdit}
                    placeholder={t('codePlaceholder')}
                    maxLength={50}
                  />
                  <p className="text-xs text-muted-foreground">{t('codeHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t('fieldName')} *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    disabled={isSubmitting}
                    placeholder={t('namePlaceholder')}
                    maxLength={255}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('sectionAccess')}</h3>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="isAdmin" className="text-sm">
                    {t('fieldAdmin')}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t('fieldAdminDescription')}</p>
                </div>
                <Switch
                  id="isAdmin"
                  checked={form.isAdmin}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isAdmin: checked }))
                  }
                  disabled={isSubmitting || isSystem}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionPermissions')}</h3>
                <p className="text-xs text-muted-foreground">
                  {t('permissionCount', { count: form.permissionIds.length })}
                </p>
              </div>

              {permissionsLoading ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  {t('loadingPermissions')}
                </div>
              ) : permissionCategories.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  {t('permissionsEmpty')}
                </div>
              ) : (
                <div className="space-y-4">
                  {permissionCategories.map((category) => {
                    const categoryIds = category.permissions.map((permission) => permission.id)
                    const allSelected = categoryIds.every((id) => form.permissionIds.includes(id))
                    const isExpanded = expandedCategories.has(category.id)

                    return (
                      <div key={category.id} className="rounded-lg border p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{category.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('permissionCategoryCount', { count: category.permissions.length })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCategorySelection(category)}
                              disabled={isSubmitting || isSystem}
                            >
                              {allSelected ? t('clearAll') : t('selectAll')}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCategoryDetails(category.id)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="mr-1 h-4 w-4" />
                              ) : (
                                <ChevronDown className="mr-1 h-4 w-4" />
                              )}
                              {isExpanded ? t('hideDetails') : t('showDetails')}
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {category.permissions.map((permission) => {
                            const isChecked = form.permissionIds.includes(permission.id)
                            const description = permission.description
                            return (
                              <label
                                key={permission.id}
                                htmlFor={`permission-${permission.id}`}
                                className="flex items-start gap-3 rounded-md border p-3 transition hover:border-primary/60"
                              >
                                <Checkbox
                                  id={`permission-${permission.id}`}
                                  checked={isChecked}
                                  onCheckedChange={() => togglePermission(permission.id)}
                                  disabled={isSubmitting || isSystem}
                                />
                                <div className="space-y-1">
                                  <p className="text-sm font-medium">
                                    {formatPermissionTitle(permission)}
                                  </p>
                                  {isExpanded && description && (
                                    <p className="text-xs text-muted-foreground">{description}</p>
                                  )}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionStatus')}</h3>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">{t('fieldActiveDescription')}</p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, isActive: checked }))
                    }
                    disabled={isSubmitting || isSystem}
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isSystem}
            className="flex-1"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
