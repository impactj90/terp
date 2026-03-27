'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Edit, Trash2, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useHrPersonnelFileCategories,
  useCreateHrPersonnelFileCategory,
  useUpdateHrPersonnelFileCategory,
  useDeleteHrPersonnelFileCategory,
} from '@/hooks'

export default function HrPersonnelFileCategoriesPage() {
  const t = useTranslations('hrPersonnelFileCategories')
  const { data: categories, isLoading } = useHrPersonnelFileCategories()
  const createMutation = useCreateHrPersonnelFileCategory()
  const updateMutation = useUpdateHrPersonnelFileCategory()
  const deleteMutation = useDeleteHrPersonnelFileCategory()

  const [formOpen, setFormOpen] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editCategory, setEditCategory] = React.useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deleteCategory, setDeleteCategory] = React.useState<any>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Form state
  const [name, setName] = React.useState('')
  const [code, setCode] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [color, setColor] = React.useState('#3B82F6')
  const [sortOrder, setSortOrder] = React.useState(0)

  const resetForm = () => {
    setName('')
    setCode('')
    setDescription('')
    setColor('#3B82F6')
    setSortOrder(0)
    setError(null)
  }

  const openCreateForm = () => {
    setEditCategory(null)
    resetForm()
    setFormOpen(true)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openEditForm = (cat: any) => {
    setEditCategory(cat)
    setName(cat.name)
    setCode(cat.code)
    setDescription(cat.description || '')
    setColor(cat.color || '#3B82F6')
    setSortOrder(cat.sortOrder || 0)
    setError(null)
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name || !code) {
      setError(t('requiredFields'))
      return
    }

    try {
      if (editCategory) {
        await updateMutation.mutateAsync({
          id: editCategory.id,
          name,
          code,
          description: description || null,
          color: color || null,
          sortOrder,
        })
      } else {
        await createMutation.mutateAsync({
          name,
          code,
          description: description || undefined,
          color: color || undefined,
          sortOrder,
        })
      }
      setFormOpen(false)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'))
    }
  }

  const handleDelete = async () => {
    if (!deleteCategory) return
    try {
      await deleteMutation.mutateAsync({ id: deleteCategory.id })
      setDeleteCategory(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteError'))
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={openCreateForm}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newCategory')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t('columnColor')}</TableHead>
                <TableHead>{t('columnName')}</TableHead>
                <TableHead>{t('columnCode')}</TableHead>
                <TableHead>{t('columnSortOrder')}</TableHead>
                <TableHead>{t('columnRoles')}</TableHead>
                <TableHead>{t('columnStatus')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(categories ?? []).map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    {cat.color && (
                      <span
                        className="inline-block h-4 w-4 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{cat.code}</code>
                  </TableCell>
                  <TableCell>{cat.sortOrder}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {cat.visibleToRoles.map((role) => (
                        <Badge key={role} variant="secondary" className="text-xs">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={cat.isActive ? 'default' : 'secondary'}>
                      {cat.isActive ? t('active') : t('inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditForm(cat)}>
                          <Edit className="mr-2 h-4 w-4" />
                          {t('edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteCategory(cat)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {(categories ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('noCategories')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Category Form Sheet */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>
              {editCategory ? t('editCategory') : t('newCategory')}
            </SheetTitle>
            <SheetDescription>
              {editCategory ? t('editCategoryDescription') : t('newCategoryDescription')}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <form id="category-form" onSubmit={handleSubmit} className="space-y-4 py-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label>{t('name')} *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('code')} *</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z_]/g, ''))}
                  placeholder={t('codePlaceholder')}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('categoryDescription')}</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('descriptionPlaceholder')}
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('color')}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-12 rounded border cursor-pointer"
                  />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#3B82F6"
                    maxLength={7}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('sortOrder')}</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                  min={0}
                />
              </div>
            </form>
          </ScrollArea>

          <SheetFooter className="pt-4 border-t">
            <Button type="submit" form="category-form" disabled={isPending}>
              {editCategory ? t('save') : t('create')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteCategory}
        onOpenChange={(open) => { if (!open) setDeleteCategory(null) }}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDescription', { name: deleteCategory?.name ?? '' })}
        confirmLabel={t('delete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
