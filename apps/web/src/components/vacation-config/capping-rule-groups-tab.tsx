'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, FolderOpen, X, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useVacationCappingRuleGroups,
  useCreateVacationCappingRuleGroup,
  useUpdateVacationCappingRuleGroup,
  useDeleteVacationCappingRuleGroup,
  useVacationCappingRules,
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
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
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

type VacationCappingRuleGroup = components['schemas']['VacationCappingRuleGroup']
type VacationCappingRule = components['schemas']['VacationCappingRule']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, any>) => string

interface FormState {
  code: string
  name: string
  description: string
  isActive: boolean
  cappingRuleIds: Set<string>
}

const INITIAL_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  isActive: true,
  cappingRuleIds: new Set(),
}

export function CappingRuleGroupsTab() {
  const t = useTranslations('adminVacationConfig')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['absence_types.manage'])

  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<VacationCappingRuleGroup | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<VacationCappingRuleGroup | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const { data: groupsData, isLoading } = useVacationCappingRuleGroups({
    enabled: !authLoading && !permLoading && canAccess,
  })
  const deleteMutation = useDeleteVacationCappingRuleGroup()
  const items = (groupsData?.data ?? []) as VacationCappingRuleGroup[]

  const filteredItems = React.useMemo(() => {
    if (!search) return items
    const s = search.toLowerCase()
    return items.filter(
      (item) => item.code?.toLowerCase().includes(s) || item.name?.toLowerCase().includes(s)
    )
  }, [items, search])

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
      setDeleteItem(null)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      if (apiError.status === 409) {
        setDeleteError(t('cappingRuleGroup.deleteInUse'))
      } else {
        setDeleteError(apiError.detail ?? apiError.message ?? t('cappingRuleGroup.failedDelete'))
      }
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const hasFilters = Boolean(search)

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('cappingRuleGroup.new')}
        </Button>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('cappingRuleGroup.searchPlaceholder')}
          className="w-full sm:w-64"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
            <X className="mr-2 h-4 w-4" />
            {t('cappingRuleGroup.clearFilters')}
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredItems.length === 1
          ? (t as TranslationFn)('cappingRuleGroup.count', { count: filteredItems.length })
          : (t as TranslationFn)('cappingRuleGroup.countPlural', { count: filteredItems.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><Skeleton className="h-64" /></div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 px-6">
              <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">{t('cappingRuleGroup.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t('cappingRuleGroup.emptyFilterHint') : t('cappingRuleGroup.emptyGetStarted')}
              </p>
              {!hasFilters && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('cappingRuleGroup.addNew')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">{t('cappingRuleGroup.columnCode')}</TableHead>
                  <TableHead>{t('cappingRuleGroup.columnName')}</TableHead>
                  <TableHead>{t('cappingRuleGroup.columnRules')}</TableHead>
                  <TableHead>{t('cappingRuleGroup.columnStatus')}</TableHead>
                  <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.capping_rules?.length ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active ? t('cappingRuleGroup.statusActive') : t('cappingRuleGroup.statusInactive')}
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
                            {t('cappingRuleGroup.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => { setDeleteItem(item); setDeleteError(null) }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('cappingRuleGroup.delete')}
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

      <CappingRuleGroupFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditItem(null) } }}
        group={editItem}
        onSuccess={handleFormSuccess}
      />

      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => { if (!open) { setDeleteItem(null); setDeleteError(null) } }}
        title={t('cappingRuleGroup.deleteTitle')}
        description={
          deleteError
            ? deleteError
            : deleteItem
              ? (t as TranslationFn)('cappingRuleGroup.deleteDescription', { name: deleteItem.name, code: deleteItem.code })
              : ''
        }
        confirmLabel={t('cappingRuleGroup.delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

// ==================== Form Sheet ====================

interface CappingRuleGroupFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: VacationCappingRuleGroup | null
  onSuccess?: () => void
}

function CappingRuleGroupFormSheet({ open, onOpenChange, group, onSuccess }: CappingRuleGroupFormSheetProps) {
  const t = useTranslations('adminVacationConfig')
  const isEdit = !!group
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM)
  const [error, setError] = React.useState<string | null>(null)
  const [memberSearch, setMemberSearch] = React.useState('')

  const createMutation = useCreateVacationCappingRuleGroup()
  const updateMutation = useUpdateVacationCappingRuleGroup()

  const { data: cappingRulesData } = useVacationCappingRules({ enabled: open })
  const cappingRules = (cappingRulesData?.data ?? []) as VacationCappingRule[]

  const filteredCappingRules = React.useMemo(() => {
    if (!memberSearch) return cappingRules
    const s = memberSearch.toLowerCase()
    return cappingRules.filter(
      (r) => r.code?.toLowerCase().includes(s) || r.name?.toLowerCase().includes(s)
    )
  }, [cappingRules, memberSearch])

  React.useEffect(() => {
    if (!open) return
    if (group) {
      setForm({
        code: group.code || '',
        name: group.name || '',
        description: group.description || '',
        isActive: group.is_active ?? true,
        cappingRuleIds: new Set((group.capping_rules ?? []).map((r) => r.id)),
      })
    } else {
      setForm(INITIAL_FORM)
    }
    setError(null)
    setMemberSearch('')
  }, [open, group])

  const toggleCappingRule = (id: string) => {
    setForm((prev) => {
      const next = new Set(prev.cappingRuleIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, cappingRuleIds: next }
    })
  }

  const toggleAll = () => {
    setForm((prev) => {
      const allSelected = filteredCappingRules.every((r) => prev.cappingRuleIds.has(r.id))
      const next = new Set(prev.cappingRuleIds)
      filteredCappingRules.forEach((r) => {
        if (allSelected) next.delete(r.id)
        else next.add(r.id)
      })
      return { ...prev, cappingRuleIds: next }
    })
  }

  const formatCappingRuleLabel = (rule: VacationCappingRule) => {
    const ruleType = rule.rule_type === 'year_end'
      ? t('cappingRule.ruleTypeYearEnd')
      : t('cappingRule.ruleTypeMidYear')
    return (t as TranslationFn)('cappingRuleGroup.memberLabel', {
      code: rule.code,
      name: rule.name,
      ruleType,
      capValue: rule.cap_value,
    })
  }

  const handleSubmit = async () => {
    setError(null)
    const errors: string[] = []
    if (!form.code.trim()) errors.push(t('cappingRuleGroup.validationCodeRequired'))
    if (!form.name.trim()) errors.push(t('cappingRuleGroup.validationNameRequired'))

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
            is_active: form.isActive,
            capping_rule_ids: Array.from(form.cappingRuleIds),
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            capping_rule_ids: Array.from(form.cappingRuleIds),
          },
        })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? (isEdit ? t('cappingRuleGroup.failedUpdate') : t('cappingRuleGroup.failedCreate')))
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('cappingRuleGroup.edit') : t('cappingRuleGroup.new')}</SheetTitle>
          <SheetDescription>{isEdit ? t('cappingRuleGroup.editDescription') : t('cappingRuleGroup.createDescription')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('cappingRuleGroup.sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="code">{t('cappingRuleGroup.fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  disabled={isSubmitting || isEdit}
                  placeholder={t('cappingRuleGroup.codePlaceholder')}
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">{t('cappingRuleGroup.codeHint')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('cappingRuleGroup.fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('cappingRuleGroup.namePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('cappingRuleGroup.fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('cappingRuleGroup.sectionMembers')}</h3>
              <SearchInput
                value={memberSearch}
                onChange={setMemberSearch}
                placeholder={t('cappingRuleGroup.membersSearchPlaceholder')}
                className="w-full"
              />
              <ScrollArea className="h-48 rounded-md border p-2">
                {filteredCappingRules.length > 0 && (
                  <div className="flex items-center gap-2 pb-2 mb-2 border-b">
                    <Checkbox
                      checked={filteredCappingRules.length > 0 && filteredCappingRules.every((r) => form.cappingRuleIds.has(r.id))}
                      onCheckedChange={() => toggleAll()}
                    />
                    <span className="text-xs text-muted-foreground">
                      {(t as TranslationFn)('cappingRuleGroup.membersSelectAll', { count: filteredCappingRules.length })}
                    </span>
                  </div>
                )}
                {filteredCappingRules.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={form.cappingRuleIds.has(r.id)}
                      onCheckedChange={() => toggleCappingRule(r.id)}
                    />
                    <span className="text-sm">{formatCappingRuleLabel(r)}</span>
                  </div>
                ))}
                {filteredCappingRules.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('cappingRuleGroup.membersNone')}</p>
                )}
              </ScrollArea>
              {form.cappingRuleIds.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {(t as TranslationFn)('cappingRuleGroup.membersSelected', { count: form.cappingRuleIds.size })}
                </p>
              )}
            </div>

            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('cappingRuleGroup.sectionStatus')}</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('cappingRuleGroup.fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">{t('cappingRuleGroup.fieldActiveDescription')}</p>
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
            {t('cappingRuleGroup.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('cappingRuleGroup.saving') : isEdit ? t('cappingRuleGroup.saveChanges') : t('cappingRuleGroup.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
