'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, FolderOpen, X, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasRole } from '@/hooks'
import {
  useVacationCalculationGroups,
  useCreateVacationCalculationGroup,
  useUpdateVacationCalculationGroup,
  useDeleteVacationCalculationGroup,
  useVacationSpecialCalculations,
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

type VacationCalculationGroup = components['schemas']['VacationCalculationGroup']
type VacationSpecialCalculation = components['schemas']['VacationSpecialCalculation']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, any>) => string

interface FormState {
  code: string
  name: string
  description: string
  basis: 'calendar_year' | 'entry_date'
  isActive: boolean
  specialCalcIds: Set<string>
}

const INITIAL_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  basis: 'calendar_year',
  isActive: true,
  specialCalcIds: new Set(),
}

export function CalculationGroupsTab() {
  const t = useTranslations('adminVacationConfig')
  const { isLoading: authLoading } = useAuth()
  const isAdmin = useHasRole(['admin'])

  const [search, setSearch] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<VacationCalculationGroup | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<VacationCalculationGroup | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  const { data: groupsData, isLoading } = useVacationCalculationGroups({
    enabled: !authLoading && isAdmin,
  })
  const deleteMutation = useDeleteVacationCalculationGroup()
  const items = (groupsData?.data ?? []) as VacationCalculationGroup[]

  const filteredItems = React.useMemo(() => {
    if (!search) return items
    const s = search.toLowerCase()
    return items.filter(
      (item) =>
        item.code?.toLowerCase().includes(s) || item.name?.toLowerCase().includes(s)
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
        setDeleteError(t('calcGroup.deleteInUse'))
      } else {
        setDeleteError(apiError.detail ?? apiError.message ?? t('calcGroup.failedDelete'))
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
          {t('calcGroup.new')}
        </Button>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('calcGroup.searchPlaceholder')}
          className="w-full sm:w-64"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
            <X className="mr-2 h-4 w-4" />
            {t('calcGroup.clearFilters')}
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredItems.length === 1
          ? (t as TranslationFn)('calcGroup.count', { count: filteredItems.length })
          : (t as TranslationFn)('calcGroup.countPlural', { count: filteredItems.length })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><Skeleton className="h-64" /></div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 px-6">
              <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">{t('calcGroup.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t('calcGroup.emptyFilterHint') : t('calcGroup.emptyGetStarted')}
              </p>
              {!hasFilters && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('calcGroup.addNew')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">{t('calcGroup.columnCode')}</TableHead>
                  <TableHead>{t('calcGroup.columnName')}</TableHead>
                  <TableHead>{t('calcGroup.columnBasis')}</TableHead>
                  <TableHead>{t('calcGroup.columnSpecialCalcs')}</TableHead>
                  <TableHead>{t('calcGroup.columnStatus')}</TableHead>
                  <TableHead className="w-16"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          item.basis === 'calendar_year'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        }
                      >
                        {item.basis === 'calendar_year'
                          ? t('calcGroup.basisCalendarYear')
                          : t('calcGroup.basisEntryDate')}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.special_calculations?.length ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active ? t('calcGroup.statusActive') : t('calcGroup.statusInactive')}
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
                            {t('calcGroup.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => { setDeleteItem(item); setDeleteError(null) }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('calcGroup.delete')}
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

      <CalculationGroupFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditItem(null) } }}
        group={editItem}
        onSuccess={handleFormSuccess}
      />

      <ConfirmDialog
        open={!!deleteItem}
        onOpenChange={(open) => { if (!open) { setDeleteItem(null); setDeleteError(null) } }}
        title={t('calcGroup.deleteTitle')}
        description={
          deleteError
            ? deleteError
            : deleteItem
              ? (t as TranslationFn)('calcGroup.deleteDescription', { name: deleteItem.name, code: deleteItem.code })
              : ''
        }
        confirmLabel={t('calcGroup.delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

// ==================== Form Sheet ====================

interface CalculationGroupFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: VacationCalculationGroup | null
  onSuccess?: () => void
}

function CalculationGroupFormSheet({ open, onOpenChange, group, onSuccess }: CalculationGroupFormSheetProps) {
  const t = useTranslations('adminVacationConfig')
  const isEdit = !!group
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM)
  const [error, setError] = React.useState<string | null>(null)
  const [memberSearch, setMemberSearch] = React.useState('')

  const createMutation = useCreateVacationCalculationGroup()
  const updateMutation = useUpdateVacationCalculationGroup()

  const { data: specialCalcsData } = useVacationSpecialCalculations({ enabled: open })
  const specialCalcs = (specialCalcsData?.data ?? []) as VacationSpecialCalculation[]

  const filteredSpecialCalcs = React.useMemo(() => {
    if (!memberSearch) return specialCalcs
    const s = memberSearch.toLowerCase()
    return specialCalcs.filter(
      (sc) => sc.type.toLowerCase().includes(s) || (sc.description ?? '').toLowerCase().includes(s)
    )
  }, [specialCalcs, memberSearch])

  React.useEffect(() => {
    if (!open) return
    if (group) {
      setForm({
        code: group.code || '',
        name: group.name || '',
        description: group.description || '',
        basis: group.basis,
        isActive: group.is_active ?? true,
        specialCalcIds: new Set((group.special_calculations ?? []).map((sc) => sc.id)),
      })
    } else {
      setForm(INITIAL_FORM)
    }
    setError(null)
    setMemberSearch('')
  }, [open, group])

  const toggleSpecialCalc = (id: string) => {
    setForm((prev) => {
      const next = new Set(prev.specialCalcIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, specialCalcIds: next }
    })
  }

  const toggleAll = () => {
    setForm((prev) => {
      const allSelected = filteredSpecialCalcs.every((sc) => prev.specialCalcIds.has(sc.id))
      const next = new Set(prev.specialCalcIds)
      filteredSpecialCalcs.forEach((sc) => {
        if (allSelected) next.delete(sc.id)
        else next.add(sc.id)
      })
      return { ...prev, specialCalcIds: next }
    })
  }

  const formatSpecialCalcLabel = (sc: VacationSpecialCalculation) => {
    const typeLabel = sc.type === 'age'
      ? t('specialCalc.typeAge')
      : sc.type === 'tenure'
        ? t('specialCalc.typeTenure')
        : t('specialCalc.typeDisability')
    if (sc.type === 'disability') {
      return (t as TranslationFn)('calcGroup.memberLabelDisability', { type: typeLabel, days: sc.bonus_days })
    }
    return (t as TranslationFn)('calcGroup.memberLabelThreshold', { type: typeLabel, threshold: sc.threshold, days: sc.bonus_days })
  }

  const handleSubmit = async () => {
    setError(null)
    const errors: string[] = []
    if (!form.code.trim()) errors.push(t('calcGroup.validationCodeRequired'))
    if (!form.name.trim()) errors.push(t('calcGroup.validationNameRequired'))

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
            basis: form.basis,
            is_active: form.isActive,
            special_calculation_ids: Array.from(form.specialCalcIds),
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            basis: form.basis,
            special_calculation_ids: Array.from(form.specialCalcIds),
          },
        })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(apiError.detail ?? apiError.message ?? (isEdit ? t('calcGroup.failedUpdate') : t('calcGroup.failedCreate')))
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('calcGroup.edit') : t('calcGroup.new')}</SheetTitle>
          <SheetDescription>{isEdit ? t('calcGroup.editDescription') : t('calcGroup.createDescription')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('calcGroup.sectionBasicInfo')}</h3>

              <div className="space-y-2">
                <Label htmlFor="code">{t('calcGroup.fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  disabled={isSubmitting || isEdit}
                  placeholder={t('calcGroup.codePlaceholder')}
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">{t('calcGroup.codeHint')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('calcGroup.fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                  placeholder={t('calcGroup.namePlaceholder')}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="basis">{t('calcGroup.fieldBasis')} *</Label>
                <Select
                  value={form.basis}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, basis: value as 'calendar_year' | 'entry_date' }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calendar_year">{t('calcGroup.basisCalendarYear')}</SelectItem>
                    <SelectItem value="entry_date">{t('calcGroup.basisEntryDate')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('calcGroup.fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>

            {/* Members section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">{t('calcGroup.sectionMembers')}</h3>
              <SearchInput
                value={memberSearch}
                onChange={setMemberSearch}
                placeholder={t('calcGroup.membersSearchPlaceholder')}
                className="w-full"
              />
              <ScrollArea className="h-48 rounded-md border p-2">
                {filteredSpecialCalcs.length > 0 && (
                  <div className="flex items-center gap-2 pb-2 mb-2 border-b">
                    <Checkbox
                      checked={
                        filteredSpecialCalcs.length > 0 &&
                        filteredSpecialCalcs.every((sc) => form.specialCalcIds.has(sc.id))
                      }
                      onCheckedChange={() => toggleAll()}
                    />
                    <span className="text-xs text-muted-foreground">
                      {(t as TranslationFn)('calcGroup.membersSelectAll', { count: filteredSpecialCalcs.length })}
                    </span>
                  </div>
                )}
                {filteredSpecialCalcs.map((sc) => (
                  <div key={sc.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={form.specialCalcIds.has(sc.id)}
                      onCheckedChange={() => toggleSpecialCalc(sc.id)}
                    />
                    <span className="text-sm">{formatSpecialCalcLabel(sc)}</span>
                  </div>
                ))}
                {filteredSpecialCalcs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('calcGroup.membersNone')}</p>
                )}
              </ScrollArea>
              {form.specialCalcIds.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {(t as TranslationFn)('calcGroup.membersSelected', { count: form.specialCalcIds.size })}
                </p>
              )}
            </div>

            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('calcGroup.sectionStatus')}</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('calcGroup.fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">{t('calcGroup.fieldActiveDescription')}</p>
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
            {t('calcGroup.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('calcGroup.saving') : isEdit ? t('calcGroup.saveChanges') : t('calcGroup.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
