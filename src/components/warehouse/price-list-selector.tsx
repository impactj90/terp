'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreHorizontal, Pencil, Trash2, Star } from 'lucide-react'
import {
  useWhPriceLists,
  useCreateWhPriceList,
  useUpdateWhPriceList,
  useDeleteWhPriceList,
} from '@/hooks'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

interface PriceListSelectorProps {
  selectedId: string | null
  onSelect: (id: string) => void
  onDeselect?: () => void
  canManage?: boolean
}

export function PriceListSelector({ selectedId, onSelect, onDeselect, canManage = false }: PriceListSelectorProps) {
  const t = useTranslations('warehousePrices')
  const { data: priceLists, isLoading } = useWhPriceLists({ isActive: true })
  const createPriceList = useCreateWhPriceList()
  const updatePriceList = useUpdateWhPriceList()
  const deletePriceList = useDeleteWhPriceList()

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [newName, setNewName] = React.useState('')

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    createPriceList.mutate(
      { name },
      {
        onSuccess: (created) => {
          toast.success(t('priceListCreated'))
          setNewName('')
          setCreateDialogOpen(false)
          if (created) onSelect(created.id)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleRename() {
    const name = newName.trim()
    if (!name || !editTarget) return
    updatePriceList.mutate(
      { id: editTarget.id, name },
      {
        onSuccess: () => {
          toast.success(t('priceListUpdated'))
          setNewName('')
          setRenameDialogOpen(false)
          setEditTarget(null)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSetDefault(id: string) {
    updatePriceList.mutate(
      { id, isDefault: true },
      {
        onSuccess: () => toast.success(t('priceListUpdated')),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDelete() {
    if (!editTarget) return
    deletePriceList.mutate(
      { id: editTarget.id },
      {
        onSuccess: () => {
          toast.success(t('priceListDeleted'))
          setDeleteDialogOpen(false)
          if (selectedId === editTarget.id) {
            onDeselect?.()
          }
          setEditTarget(null)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function openCreateDialog() {
    setNewName('')
    setCreateDialogOpen(true)
  }

  function openRenameDialog(pl: { id: string; name: string }) {
    setEditTarget(pl)
    setNewName(pl.name)
    setRenameDialogOpen(true)
  }

  function openDeleteDialog(pl: { id: string; name: string }) {
    setEditTarget(pl)
    setDeleteDialogOpen(true)
  }

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t('priceListName')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  const items = priceLists ?? []

  return (
    <>
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">{t('priceListName')}</CardTitle>
            {canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={openCreateDialog}
                title={t('newPriceList')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100dvh-16rem)]">
            <div className="space-y-0.5 px-3 pb-3">
              {items.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('noEntries')}
                  </p>
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openCreateDialog}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t('newPriceList')}
                    </Button>
                  )}
                </div>
              )}
              {items.map((pl: { id: string; name: string; isDefault: boolean; _count?: { entries: number } }) => (
                <div
                  key={pl.id}
                  className={cn(
                    'group flex items-center gap-1 rounded-md text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    selectedId === pl.id && 'bg-accent text-accent-foreground font-medium'
                  )}
                >
                  <button
                    onClick={() => onSelect(pl.id)}
                    className="flex-1 text-left px-3 py-2 min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate">{pl.name}</span>
                      {pl.isDefault && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {t('defaultBadge')}
                        </Badge>
                      )}
                    </div>
                  </button>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                          <span className="sr-only">Aktionen</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => openRenameDialog(pl)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          {t('renamePriceList')}
                        </DropdownMenuItem>
                        {!pl.isDefault && (
                          <DropdownMenuItem onClick={() => handleSetDefault(pl.id)}>
                            <Star className="h-4 w-4 mr-2" />
                            {t('setAsDefault')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openDeleteDialog(pl)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('deletePriceList')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('newPriceList')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('priceListNamePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createPriceList.isPending || !newName.trim()}
            >
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('renamePriceList')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('priceListNamePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleRename}
              disabled={updatePriceList.isPending || !newName.trim()}
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deletePriceList')}</DialogTitle>
            <DialogDescription>
              {t('confirmDeletePriceList', { name: editTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePriceList.isPending}
            >
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
