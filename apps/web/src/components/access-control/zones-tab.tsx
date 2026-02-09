'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Shield, X, MoreHorizontal, Edit, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { useHasPermission } from '@/hooks'
import {
  useAccessZones,
  useCreateAccessZone,
  useUpdateAccessZone,
  useDeleteAccessZone,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslationFn = (key: string, values?: Record<string, any>) => string

type AccessZone = components['schemas']['AccessZone']

interface FormState {
  code: string
  name: string
  description: string
  sortOrder: string
  isActive: boolean
}

const INITIAL_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  sortOrder: '0',
  isActive: true,
}

export function ZonesTab() {
  const t = useTranslations('adminAccessControl')
  const { isLoading: authLoading } = useAuth()
  const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['access_control.manage'])

  // Filter state
  const [search, setSearch] = React.useState('')

  // CRUD state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<AccessZone | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<AccessZone | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  // Data
  const { data: zoneData, isLoading } = useAccessZones({
    enabled: !authLoading && !permLoading && canAccess,
  })
  const deleteMutation = useDeleteAccessZone()
  const items = (zoneData?.data ?? []) as AccessZone[]

  // Filtering
  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      if (search) {
        const s = search.toLowerCase()
        if (
          !item.code.toLowerCase().includes(s) &&
          !item.name.toLowerCase().includes(s)
        ) {
          return false
        }
      }
      return true
    })
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
        setDeleteError(t('zones.failedDelete'))
      } else {
        setDeleteError(apiError.detail ?? apiError.message ?? t('zones.failedDelete'))
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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('zones.new')}
        </Button>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('zones.searchPlaceholder')}
          className="w-full sm:w-64"
        />

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t('zones.clearFilters')}
          </Button>
        )}
      </div>

      {/* Count */}
      <div className="text-sm text-muted-foreground">
        {filteredItems.length === 1
          ? (t as TranslationFn)('zones.count', { count: filteredItems.length })
          : (t as TranslationFn)('zones.countPlural', { count: filteredItems.length })}
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
              <Shield className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">{t('zones.emptyTitle')}</h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters ? t('zones.emptyFilterHint') : t('zones.emptyGetStarted')}
              </p>
              {!hasFilters && (
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('zones.new')}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('zones.columnCode')}</TableHead>
                  <TableHead>{t('zones.columnName')}</TableHead>
                  <TableHead>{t('zones.columnSortOrder')}</TableHead>
                  <TableHead>{t('zones.columnActive')}</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.sort_order ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={item.is_active ? 'default' : 'secondary'}>
                        {item.is_active
                          ? t('zones.statusActive')
                          : t('zones.statusInactive')}
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
                            {t('zones.edit')}
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
                            {t('zones.delete')}
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

      {/* Form Sheet */}
      <ZoneFormSheet
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
        title={t('zones.deleteTitle')}
        description={
          deleteError
            ? deleteError
            : deleteItem
              ? (t as TranslationFn)('zones.deleteDescription', {
                  name: deleteItem.name,
                })
              : ''
        }
        confirmLabel={t('zones.delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

// ==================== Form Sheet ====================

interface ZoneFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: AccessZone | null
  onSuccess?: () => void
}

function ZoneFormSheet({
  open,
  onOpenChange,
  item,
  onSuccess,
}: ZoneFormSheetProps) {
  const t = useTranslations('adminAccessControl')
  const isEdit = !!item
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM)
  const [error, setError] = React.useState<string | null>(null)

  const createMutation = useCreateAccessZone()
  const updateMutation = useUpdateAccessZone()

  React.useEffect(() => {
    if (!open) return

    if (item) {
      setForm({
        code: item.code,
        name: item.name,
        description: item.description ?? '',
        sortOrder: String(item.sort_order ?? 0),
        isActive: item.is_active ?? true,
      })
    } else {
      setForm(INITIAL_FORM)
    }
    setError(null)
  }, [open, item])

  const handleSubmit = async () => {
    setError(null)

    const errors: string[] = []
    if (!form.code.trim()) errors.push(t('zones.validationCodeRequired'))
    if (!form.name.trim()) errors.push(t('zones.validationNameRequired'))

    if (errors.length > 0) {
      setError(errors.join('. '))
      return
    }

    try {
      if (isEdit && item) {
        await updateMutation.mutateAsync({
          path: { id: item.id },
          body: {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            sort_order: parseInt(form.sortOrder, 10) || 0,
            is_active: form.isActive,
          },
        })
      } else {
        await createMutation.mutateAsync({
          body: {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            sort_order: parseInt(form.sortOrder, 10) || 0,
          },
        })
      }
      onSuccess?.()
    } catch (err) {
      const apiError = err as { detail?: string; message?: string }
      setError(
        apiError.detail ?? apiError.message ?? (isEdit ? t('zones.failedUpdate') : t('zones.failedCreate'))
      )
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? t('zones.edit') : t('zones.new')}</SheetTitle>
          <SheetDescription>
            {isEdit ? t('zones.editDescription') : t('zones.createDescription')}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('zones.sectionBasicInfo')}
              </h3>

              <div className="space-y-2">
                <Label htmlFor="code">{t('zones.fieldCode')} *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                  disabled={isSubmitting || isEdit}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">{t('zones.fieldName')} *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('zones.fieldDescription')}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortOrder">{t('zones.fieldSortOrder')}</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                  disabled={isSubmitting}
                  min={0}
                  step={1}
                />
              </div>
            </div>

            {/* Status (edit only) */}
            {isEdit && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('zones.sectionStatus')}
                </h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">{t('zones.fieldActive')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('zones.fieldActiveDescription')}
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
            {t('zones.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? t('zones.saving')
              : isEdit
                ? t('zones.saveChanges')
                : t('zones.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
