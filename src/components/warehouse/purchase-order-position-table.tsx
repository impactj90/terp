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
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Plus, Edit, Trash2, Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  useWhPOPositions,
  useAddWhPOPosition,
  useUpdateWhPOPosition,
  useDeleteWhPOPosition,
} from '@/hooks/use-wh-purchase-orders'
import { ArticleSearchPopover } from './article-search-popover'

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return '\u2014'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(price)
}

interface PurchaseOrderPositionTableProps {
  purchaseOrderId: string
  supplierId: string
  isDraft: boolean
}

interface AddPositionForm {
  articleId: string
  articleLabel: string
  quantity: string
  unitPrice: string
  unit: string
  description: string
  flatCosts: string
}

const EMPTY_ADD_FORM: AddPositionForm = {
  articleId: '',
  articleLabel: '',
  quantity: '1',
  unitPrice: '',
  unit: '',
  description: '',
  flatCosts: '',
}

interface EditPositionForm {
  quantity: string
  unitPrice: string
  unit: string
  description: string
  flatCosts: string
}

export function PurchaseOrderPositionTable({
  purchaseOrderId,
  supplierId: _supplierId,
  isDraft,
}: PurchaseOrderPositionTableProps) {
  const t = useTranslations('warehousePurchaseOrders')

  const { data: positions, isLoading } = useWhPOPositions(purchaseOrderId)
  const addMutation = useAddWhPOPosition()
  const updateMutation = useUpdateWhPOPosition()
  const deleteMutation = useDeleteWhPOPosition()

  const [isAdding, setIsAdding] = React.useState(false)
  const [addForm, setAddForm] = React.useState<AddPositionForm>(EMPTY_ADD_FORM)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState<EditPositionForm>({
    quantity: '',
    unitPrice: '',
    unit: '',
    description: '',
    flatCosts: '',
  })
  const [deleteTarget, setDeleteTarget] = React.useState<{
    id: string
    label: string
  } | null>(null)

  function handleAddPosition() {
    if (!addForm.articleId || !addForm.quantity) return
    addMutation.mutate(
      {
        purchaseOrderId,
        articleId: addForm.articleId,
        quantity: parseFloat(addForm.quantity) || 1,
        unitPrice: addForm.unitPrice
          ? parseFloat(addForm.unitPrice)
          : undefined,
        unit: addForm.unit || undefined,
        description: addForm.description || undefined,
        flatCosts: addForm.flatCosts
          ? parseFloat(addForm.flatCosts)
          : undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('toastPositionAdded'))
          setIsAdding(false)
          setAddForm(EMPTY_ADD_FORM)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function startEdit(position: {
    id: string
    quantity: number
    unitPrice?: number | null
    unit?: string | null
    description?: string | null
    flatCosts?: number | null
  }) {
    setEditingId(position.id)
    setEditForm({
      quantity: String(position.quantity),
      unitPrice: position.unitPrice != null ? String(position.unitPrice) : '',
      unit: position.unit || '',
      description: position.description || '',
      flatCosts: position.flatCosts != null ? String(position.flatCosts) : '',
    })
  }

  function handleSaveEdit() {
    if (!editingId) return
    updateMutation.mutate(
      {
        id: editingId,
        quantity: parseFloat(editForm.quantity) || undefined,
        unitPrice: editForm.unitPrice
          ? parseFloat(editForm.unitPrice)
          : undefined,
        unit: editForm.unit || undefined,
        description: editForm.description || undefined,
        flatCosts: editForm.flatCosts
          ? parseFloat(editForm.flatCosts)
          : undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('toastPositionUpdated'))
          setEditingId(null)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteMutation.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success(t('toastPositionDeleted'))
          setDeleteTarget(null)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  const showReceivedCol = !isDraft

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('sectionPositions')}</h3>
        {isDraft && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsAdding(true)
              setAddForm(EMPTY_ADD_FORM)
            }}
            disabled={isAdding}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('posActionAdd')}
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">{t('posColPosition')}</TableHead>
            <TableHead>{t('posColArticle')}</TableHead>
            <TableHead className="w-[120px]">
              {t('posColSupplierArticleNumber')}
            </TableHead>
            <TableHead>{t('posColDescription')}</TableHead>
            <TableHead className="w-[80px] text-right">
              {t('posColQuantity')}
            </TableHead>
            {showReceivedCol && (
              <TableHead className="w-[80px] text-right">
                {t('posColReceivedQuantity')}
              </TableHead>
            )}
            <TableHead className="w-[60px]">{t('posColUnit')}</TableHead>
            <TableHead className="w-[100px] text-right">
              {t('posColUnitPrice')}
            </TableHead>
            <TableHead className="w-[100px] text-right">
              {t('posColFlatCosts')}
            </TableHead>
            <TableHead className="w-[100px] text-right">
              {t('posColTotalPrice')}
            </TableHead>
            {isDraft && <TableHead className="w-[80px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(!positions || positions.length === 0) && !isAdding ? (
            <TableRow>
              <TableCell
                colSpan={isDraft ? (showReceivedCol ? 11 : 10) : (showReceivedCol ? 10 : 9)}
                className="text-center text-muted-foreground py-8"
              >
                {t('noPositions')}
              </TableCell>
            </TableRow>
          ) : (
            (positions ?? []).map(
              (
                pos: {
                  id: string
                  sortOrder: number
                  article?: {
                    id: string
                    number: string
                    name: string
                    unit: string
                  } | null
                  supplierArticleNumber?: string | null
                  description?: string | null
                  quantity: number
                  receivedQuantity: number
                  unit?: string | null
                  unitPrice?: number | null
                  flatCosts?: number | null
                  totalPrice?: number | null
                },
                idx: number
              ) => {
                const isEditing = editingId === pos.id

                return (
                  <TableRow key={pos.id}>
                    <TableCell className="text-sm">{idx + 1}</TableCell>
                    <TableCell className="text-sm">
                      {pos.article && (
                        <span>
                          <span className="font-mono text-xs mr-1">
                            {pos.article.number}
                          </span>
                          {pos.article.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {pos.supplierArticleNumber || '\u2014'}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editForm.description}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              description: e.target.value,
                            })
                          }
                          className="h-8 text-sm"
                        />
                      ) : (
                        <span className="text-sm">
                          {pos.description || '\u2014'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editForm.quantity}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              quantity: e.target.value,
                            })
                          }
                          className="h-8 text-sm text-right w-20"
                        />
                      ) : (
                        <span className="text-sm">{pos.quantity}</span>
                      )}
                    </TableCell>
                    {showReceivedCol && (
                      <TableCell className="text-right text-sm">
                        {pos.receivedQuantity}
                      </TableCell>
                    )}
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editForm.unit}
                          onChange={(e) =>
                            setEditForm({ ...editForm, unit: e.target.value })
                          }
                          className="h-8 text-sm w-16"
                        />
                      ) : (
                        <span className="text-sm">{pos.unit || '\u2014'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editForm.unitPrice}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              unitPrice: e.target.value,
                            })
                          }
                          className="h-8 text-sm text-right w-24"
                        />
                      ) : (
                        <span className="text-sm">
                          {formatPrice(pos.unitPrice)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editForm.flatCosts}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              flatCosts: e.target.value,
                            })
                          }
                          className="h-8 text-sm text-right w-24"
                        />
                      ) : (
                        <span className="text-sm">
                          {formatPrice(pos.flatCosts)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatPrice(pos.totalPrice)}
                    </TableCell>
                    {isDraft && (
                      <TableCell>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={handleSaveEdit}
                              disabled={updateMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => startEdit(pos)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  id: pos.id,
                                  label: pos.article
                                    ? `${pos.article.number} — ${pos.article.name}`
                                    : pos.id,
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              }
            )
          )}

          {/* Add position row */}
          {isAdding && (
            <TableRow>
              <TableCell className="text-sm text-muted-foreground">
                +
              </TableCell>
              <TableCell colSpan={2}>
                <ArticleSearchPopover
                  value={addForm.articleId}
                  onSelect={(id, label) =>
                    setAddForm({ ...addForm, articleId: id, articleLabel: label })
                  }
                  placeholder={t('posArticlePlaceholder')}
                />
              </TableCell>
              <TableCell>
                <Input
                  value={addForm.description}
                  onChange={(e) =>
                    setAddForm({ ...addForm, description: e.target.value })
                  }
                  placeholder={t('posColDescription')}
                  className="h-8 text-sm"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="0.01"
                  value={addForm.quantity}
                  onChange={(e) =>
                    setAddForm({ ...addForm, quantity: e.target.value })
                  }
                  className="h-8 text-sm text-right w-20"
                />
              </TableCell>
              {showReceivedCol && <TableCell />}
              <TableCell>
                <Input
                  value={addForm.unit}
                  onChange={(e) =>
                    setAddForm({ ...addForm, unit: e.target.value })
                  }
                  className="h-8 text-sm w-16"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="0.01"
                  value={addForm.unitPrice}
                  onChange={(e) =>
                    setAddForm({ ...addForm, unitPrice: e.target.value })
                  }
                  className="h-8 text-sm text-right w-24"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="0.01"
                  value={addForm.flatCosts}
                  onChange={(e) =>
                    setAddForm({ ...addForm, flatCosts: e.target.value })
                  }
                  className="h-8 text-sm text-right w-24"
                />
              </TableCell>
              <TableCell />
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleAddPosition}
                    disabled={!addForm.articleId || addMutation.isPending}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setIsAdding(false)
                      setAddForm(EMPTY_ADD_FORM)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('posActionDelete')}
        description={deleteTarget?.label ?? ''}
        confirmLabel={t('posActionDelete')}
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
