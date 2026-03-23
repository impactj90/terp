'use client'

import * as React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import {
  useWhArticleBom,
  useAddWhArticleBom,
  useUpdateWhArticleBom,
  useRemoveWhArticleBom,
} from '@/hooks'
import { ArticleSearchPopover } from './article-search-popover'

interface ArticleBomListProps {
  articleId: string
}

export function ArticleBomList({ articleId }: ArticleBomListProps) {
  const t = useTranslations('warehouseArticles')
  const { data: bomItems, isLoading } = useWhArticleBom(articleId)
  const addBom = useAddWhArticleBom()
  const updateBom = useUpdateWhArticleBom()
  const removeBom = useRemoveWhArticleBom()

  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editId, setEditId] = React.useState<string | null>(null)
  const [selectedArticleId, setSelectedArticleId] = React.useState<string | null>(null)
  const [selectedArticleName, setSelectedArticleName] = React.useState('')
  const [quantity, setQuantity] = React.useState('1')
  const [notes, setNotes] = React.useState('')

  function handleAdd() {
    setSelectedArticleId(null)
    setSelectedArticleName('')
    setQuantity('1')
    setNotes('')
    setAddDialogOpen(true)
  }

  function handleEdit(item: Record<string, unknown>) {
    setEditId(item.id as string)
    setQuantity(String(item.quantity))
    setNotes((item.notes as string) || '')
    setEditDialogOpen(true)
  }

  function handleRemove(id: string) {
    removeBom.mutate(
      { id },
      {
        onSuccess: () => toast.success(t('toastBomRemoved')),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSubmitAdd() {
    if (!selectedArticleId) return
    addBom.mutate(
      {
        parentArticleId: articleId,
        childArticleId: selectedArticleId,
        quantity: parseFloat(quantity) || 1,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('toastBomAdded'))
          setAddDialogOpen(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSubmitEdit() {
    if (!editId) return
    updateBom.mutate(
      {
        id: editId,
        quantity: parseFloat(quantity) || 1,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          toast.success(t('toastBomUpdated'))
          setEditDialogOpen(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('bomHeading')}</h3>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          {t('actionAddComponent')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t('loading')}</div>
      ) : !bomItems || bomItems.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          {t('noBomComponents')}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('labelArticleNumber')}</TableHead>
              <TableHead>{t('colName')}</TableHead>
              <TableHead className="w-[100px] text-right">{t('colQuantity')}</TableHead>
              <TableHead>{t('colNotes')}</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bomItems.map((item: Record<string, unknown>) => {
              const child = item.childArticle as { number?: string; name?: string; unit?: string } | null
              return (
                <TableRow key={item.id as string}>
                  <TableCell className="font-mono text-sm">
                    {child?.number || '—'}
                  </TableCell>
                  <TableCell>{child?.name || '—'}</TableCell>
                  <TableCell className="text-right">
                    {item.quantity as number} {child?.unit || ''}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(item.notes as string) || '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(item)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleRemove(item.id as string)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* Add Component Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('actionAddComponent')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('labelArticleRequired')}</Label>
              <ArticleSearchPopover
                value={selectedArticleId}
                onSelect={(id, name) => {
                  setSelectedArticleId(id)
                  setSelectedArticleName(name)
                }}
                placeholder={t('articleSearchPlaceholder')}
              />
              {selectedArticleName && (
                <p className="text-sm text-muted-foreground">{selectedArticleName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('labelQuantity')}</Label>
              <Input
                type="number"
                step="0.001"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('labelNotes')}</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSubmitAdd} disabled={!selectedArticleId || addBom.isPending}>
              {addBom.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('actionAdd')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Component Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dialogEditComponent')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('labelQuantity')}</Label>
              <Input
                type="number"
                step="0.001"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('labelNotes')}</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSubmitEdit} disabled={updateBom.isPending}>
              {updateBom.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
