'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Sparkles, X, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useVacationSpecialCalculations,
  useCreateVacationSpecialCalculation,
  useUpdateVacationSpecialCalculation,
  useDeleteVacationSpecialCalculation,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { components } from '@/lib/api/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, any>) => string

type VacationSpecialCalculation = components['schemas']['VacationSpecialCalculation']
type SpecialCalcType = 'age' | 'tenure' | 'disability'
type TypeFilter = 'all' | SpecialCalcType

interface FormState {
  type: SpecialCalcType
  threshold: string
  bonusDays: string
  description: string
  isActive: boolean
}

const INITIAL_FORM: FormState = {
  type: 'age',
  threshold: '0',
  bonusDays: '',
  description: '',
  isActive: true,
}

const TYPE_BADGE_CONFIG: Record<SpecialCalcType, { className: string; labelKey: string }> = {
  age: {
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    labelKey: 'specialCalc.typeAge',
  },
  tenure: {
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    labelKey: 'specialCalc.typeTenure',
  },
  disability: {
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    labelKey: 'specialCalc.typeDisability',
  },
}

export function SpecialCalculationsTab() {
  const t = useTranslations('adminVacationConfig')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['absence_types.manage'])

  // Filter state
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all')

  // CRUD state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<VacationSpecialCalculation | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<VacationSpecialCalculation | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  // Data
  const { data: calcData, isLoading } = useVacationSpecialCalculations({
    enabled: !authLoading && !permLoading && canAccess,
  })
  const deleteMutation = useDeleteVacationSpecialCalculation()
  const items = (calcData?.data ?? []) as VacationSpecialCalculation[]

  // Filtering
  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false
      if (search) {
        const s = search.toLowerCase()
        if (
          !item.type.toLowerCase().includes(s) &&
          !(item.description ?? '').toLowerCase().includes(s)
        ) {
          return false
        }
      }
      return true
    })
  }, [items, search, typeFilter])

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync({ path: { id: deleteItem.id } })
      setDeleteItem(null)
    } catch (err) {
      const apiError = err as { status?: number; detail?: string; message?: string }
      if (apiError.status === 409) {
        setDeleteError(t('specialCalc.failedDelete'))
      } else {
        setDeleteError(apiError.detail ?? apiError.message ?? t('specialCalc.failedDelete'))
      }
    }
  }

  const handleFormSuccess = () => {
    setCreateOpen(false)
    setEditItem(null)
  }

  const hasFilters = Boolean(search) || typeFilter !== 'all'

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('specialCalc.new')}
        </Button>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('specialCalc.searchPlaceholder')}
          className="w-full sm:w-64"
        />

        <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <TabsList>
            <TabsTrigger value="all">{t('specialCalc.filterAll')}</TabsTrigger>
            <TabsTrigger value="age">{t('specialCalc.typeAge')}</TabsTrigger>
            <TabsTrigger value="tenure">{t('specialCalc.typeTenure')}</TabsTrigger>
            <TabsTrigger value="disability">{t('specialCalc.typeDisability')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setTypeFilter('all')
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('specialCalc.clearFilters')}
          </Button>
        )}
      </div>

      {/* Count */}
      <div className="text-sm text-muted-foreground">
        {filteredItems.length === 1
          ? (t as TranslationFn)('specialCalc.count', { count: filteredItems.length })
          : (t as TranslationFn)('specialCalc.countPlural', { count: filteredItems.length })}
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
              <Sparkles className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">{t('specialCalc.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t('specialCalc.emptyFilterHint') : t('specialCalc.emptyGetStarted')}
              </p>
              {!hasFilters && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('specialCalc.addNew')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('specialCalc.columnType')}</TableHead>
                  <TableHead>{t('specialCalc.columnThreshold')}</TableHead>
                  <TableHead>{t('specialCalc.columnBonusDays')}</TableHead>
                  <TableHead>{t('specialCalc.columnStatus')}</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  const typeConfig = TYPE_BADGE_CONFIG[item.type]
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant="secondary" className={typeConfig.className}>
                          {t(typeConfig.labelKey as Parameters<typeof t>[0])}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.type === 'disability'
                          ? '-'
                          : (t as TranslationFn)('specialCalc.thresholdYears', { count: item.threshold })}
                      </TableCell>
                      <TableCell>+{item.bonus_days}</TableCell>
                      <TableCell>
                        <Badge variant={item.is_active ? 'default' : 'secondary'}>
                          {item.is_active
                            ? t('specialCalc.statusActive')
                            : t('specialCalc.statusInactive')}
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
                              {t('specialCalc.edit')}
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
                              {t('specialCalc.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form Sheet */}
      <SpecialCalculationFormSheet
        open={createOpen || !!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditItem(null)
          }
        }}
        item={editItem}
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
        title={t('specialCalc.deleteTitle')}
        description={
          deleteError
            ? deleteError
            : deleteItem
              ? (t as TranslationFn)('specialCalc.deleteDescription', {
                  type: t(TYPE_BADGE_CONFIG[deleteItem.type].labelKey as Parameters<typeof t>[0]),
                  threshold: deleteItem.threshold,
                })
              : ''
        }
        confirmLabel={t('specialCalc.delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

// ==================== Form Sheet ====================

interface SpecialCalculationFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: VacationSpecialCalculation | null
  onSuccess?: () => void
}

function SpecialCalculationFormSheet({
  open,
  onOpenChange,
  item,
  onSuccess,
}: SpecialCalculationFormSheetProps) {
  const t = useTranslations('adminVacationConfig')
  const isEdit = !!item
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateVacationSpecialCalculation()
  const updateMutation = useUpdateVacationSpecialCalculation()

  React.useEffect(() => {
    if (!open) return

    if (item) {
      setForm({
        type: item.type,
        threshold: String(item.threshold),
        bonusDays: String(item.bonus_days),
        description: item.description ?? '',
        isActive: item.is_active ?? true,
      })
    } else {
      setForm(INITIAL_FORM)
    }
    setError(null)
  }, [open, item])

  // Force threshold to 0 when type is disability
  React.useEffect(() => {
    if (form.type === 'disability') {
      setForm((prev) => ({ ...prev, threshold: '0' }))
    }
  }, [form.type])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.type) errors.push(t('specialCalc.validationTypeRequired'))
    const bonusDays = parseFloat(form.bonusDays)
    if (isNaN(bonusDays) || bonusDays <= 0) errors.push(t('specialCalc.validationBonusDaysRequired'))
    const threshold = parseInt(form.threshold, 10)
    if (isNaN(threshold) || threshold < 0) errors.push(t('specialCalc.validationThresholdRequired'))
    if (form.type === 'disability' && threshold !== 0)
      errors.push(t('specialCalc.validationDisabilityThreshold'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && item) {
        await updateMutation.mutateAsync({
          path: { id: item.id },
          body: {
            threshold,
            bonus_days: bonusDays,
            description: form.description.trim() || undefined,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            type: form.type,
            threshold,
            bonus_days: bonusDays,
            description: form.description.trim() || undefined,
          },
        })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? (isEdit ? t('specialCalc.failedUpdate') : t('specialCalc.failedCreate'))
      )
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('specialCalc.edit') : t('specialCalc.new')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('specialCalc.editDescription') : t('specialCalc.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('specialCalc.sectionBasicInfo')}
              </h3>

              <div className="space-y-2">
                <Label htmlFor="type">{t('specialCalc.fieldType')} *</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, type: value as SpecialCalcType }))
                  }
                  disabled={isSubmitting || isEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="age">{t('specialCalc.typeAge')}</SelectItem>
                    <SelectItem value="tenure">{t('specialCalc.typeTenure')}</SelectItem>
                    <SelectItem value="disability">{t('specialCalc.typeDisability')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="threshold">{t('specialCalc.fieldThreshold')} *</Label>
                <Input
                  id="threshold"
                  type="number"
                  value={form.threshold}
                  onChange={(e) => setForm((prev) => ({ ...prev, threshold: e.target.value }))}
                  disabled={isSubmitting || form.type === 'disability'}
                  min={0}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">{t('specialCalc.thresholdHint')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bonusDays">{t('specialCalc.fieldBonusDays')} *</Label>
                <Input
                  id="bonusDays"
                  type="number"
                  value={form.bonusDays}
                  onChange={(e) => setForm((prev) => ({ ...prev, bonusDays: e.target.value }))}
                  disabled={isSubmitting}
                  min={0.5}
                  step={0.5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('specialCalc.fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>

            {/* Status (edit only) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('specialCalc.sectionStatus')}
                </h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('specialCalc.fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('specialCalc.fieldActiveDescription')}
                    </p>
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
              </div>
            )}

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
            {t('specialCalc.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? t('specialCalc.saving')
              : isEdit
                ? t('specialCalc.saveChanges')
                : t('specialCalc.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
