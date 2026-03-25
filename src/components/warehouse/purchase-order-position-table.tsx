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
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Edit, Trash2, Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  useWhPOPositions,
  useAddWhPOPosition,
  useUpdateWhPOPosition,
  useDeleteWhPOPosition,
} from '@/hooks/use-wh-purchase-orders'
import { ArticleSearchPopover, type ArticleSearchResult } from './article-search-popover'

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
  positionType: 'ARTICLE' | 'FREETEXT' | 'TEXT'
  addMode: 'POSITION' | 'TEXT'
  articleId: string
  articleLabel: string
  freeText: string
  quantity: string
  unitPrice: string
  unit: string
  description: string
  flatCosts: string
  vatRate: string
}

const EMPTY_ADD_FORM: AddPositionForm = {
  positionType: 'ARTICLE',
  addMode: 'POSITION',
  articleId: '',
  articleLabel: '',
  freeText: '',
  quantity: '1',
  unitPrice: '',
  unit: '',
  description: '',
  flatCosts: '',
  vatRate: '19',
}

interface EditPositionForm {
  freeText: string
  quantity: string
  unitPrice: string
  unit: string
  description: string
  flatCosts: string
  vatRate: string
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
    freeText: '',
    quantity: '',
    unitPrice: '',
    unit: '',
    description: '',
    flatCosts: '',
    vatRate: '19',
  })
  const [deleteTarget, setDeleteTarget] = React.useState<{
    id: string
    label: string
  } | null>(null)

  function handleAddPosition() {
    const type = addForm.positionType

    if (type === 'ARTICLE' && !addForm.articleId) return
    if (type === 'FREETEXT' && (!addForm.freeText || !addForm.unitPrice)) return
    if (type === 'TEXT' && !addForm.freeText) return

    addMutation.mutate(
      {
        purchaseOrderId,
        positionType: type,
        articleId: type === 'ARTICLE' ? addForm.articleId : undefined,
        freeText: type !== 'ARTICLE' ? addForm.freeText || undefined : undefined,
        quantity: type !== 'TEXT'
          ? (parseFloat(addForm.quantity) || 1)
          : undefined,
        unitPrice: type !== 'TEXT' && addForm.unitPrice
          ? parseFloat(addForm.unitPrice)
          : undefined,
        unit: type !== 'TEXT' && addForm.unit ? addForm.unit : undefined,
        description: addForm.description || undefined,
        flatCosts: type !== 'TEXT' && addForm.flatCosts
          ? parseFloat(addForm.flatCosts)
          : undefined,
        vatRate: type !== 'TEXT' && addForm.vatRate
          ? parseFloat(addForm.vatRate)
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
    freeText?: string | null
    quantity?: number | null
    unitPrice?: number | null
    unit?: string | null
    description?: string | null
    flatCosts?: number | null
    vatRate?: number | null
  }) {
    setEditingId(position.id)
    setEditForm({
      freeText: position.freeText || '',
      quantity: position.quantity != null ? String(position.quantity) : '',
      unitPrice: position.unitPrice != null ? String(position.unitPrice) : '',
      unit: position.unit || '',
      description: position.description || '',
      flatCosts: position.flatCosts != null ? String(position.flatCosts) : '',
      vatRate: position.vatRate != null ? String(position.vatRate) : '19',
    })
  }

  function handleSaveEdit() {
    if (!editingId) return
    updateMutation.mutate(
      {
        id: editingId,
        freeText: editForm.freeText || undefined,
        quantity: parseFloat(editForm.quantity) || undefined,
        unitPrice: editForm.unitPrice
          ? parseFloat(editForm.unitPrice)
          : undefined,
        unit: editForm.unit || undefined,
        description: editForm.description || undefined,
        flatCosts: editForm.flatCosts
          ? parseFloat(editForm.flatCosts)
          : undefined,
        vatRate: editForm.vatRate
          ? parseFloat(editForm.vatRate)
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

  const isAddDisabled =
    (addForm.positionType === 'ARTICLE' && !addForm.articleId) ||
    (addForm.positionType === 'FREETEXT' && (!addForm.freeText || !addForm.unitPrice)) ||
    (addForm.positionType === 'TEXT' && !addForm.freeText) ||
    (addForm.addMode === 'POSITION' && !addForm.articleId && !addForm.freeText) ||
    addMutation.isPending

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

      <div className="[&>div]:overflow-visible">
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
            <TableHead className="w-[70px] text-right">
              {t('posColVatRate')}
            </TableHead>
            {isDraft && <TableHead className="w-[80px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(!positions || positions.length === 0) && !isAdding ? (
            <TableRow>
              <TableCell
                colSpan={isDraft ? (showReceivedCol ? 12 : 11) : (showReceivedCol ? 11 : 10)}
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
                  positionType?: string
                  freeText?: string | null
                  article?: {
                    id: string
                    number: string
                    name: string
                    unit: string
                  } | null
                  supplierArticleNumber?: string | null
                  description?: string | null
                  quantity?: number | null
                  receivedQuantity: number
                  unit?: string | null
                  unitPrice?: number | null
                  flatCosts?: number | null
                  totalPrice?: number | null
                  vatRate?: number | null
                },
                idx: number
              ) => {
                const isEditing = editingId === pos.id
                const posType = pos.positionType || 'ARTICLE'
                const isTextType = posType === 'TEXT'

                return (
                  <TableRow key={pos.id}>
                    <TableCell className="text-sm">{idx + 1}</TableCell>
                    <TableCell className="text-sm">
                      {posType === 'TEXT' && (
                        <span className="italic text-muted-foreground">{pos.freeText}</span>
                      )}
                      {posType === 'FREETEXT' && (
                        <span>{pos.freeText}</span>
                      )}
                      {posType === 'ARTICLE' && pos.article && (
                        <span>
                          <span className="font-mono text-xs mr-1">
                            {pos.article.number}
                          </span>
                          {pos.article.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {posType === 'ARTICLE' ? (pos.supplierArticleNumber || '\u2014') : '\u2014'}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        posType !== 'ARTICLE' ? (
                          <Textarea
                            value={editForm.freeText}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                freeText: e.target.value,
                              })
                            }
                            className="text-sm min-h-[32px]"
                            rows={1}
                          />
                        ) : (
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
                        )
                      ) : (
                        <span className="text-sm">
                          {pos.description || '\u2014'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing && !isTextType ? (
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
                        <span className="text-sm">{pos.quantity != null ? pos.quantity : '\u2014'}</span>
                      )}
                    </TableCell>
                    {showReceivedCol && (
                      <TableCell className="text-right text-sm">
                        {isTextType ? '\u2014' : pos.receivedQuantity}
                      </TableCell>
                    )}
                    <TableCell>
                      {isEditing && !isTextType ? (
                        <Input
                          value={editForm.unit}
                          onChange={(e) =>
                            setEditForm({ ...editForm, unit: e.target.value })
                          }
                          className="h-8 text-sm w-16"
                        />
                      ) : (
                        <span className="text-sm">{isTextType ? '\u2014' : (pos.unit || '\u2014')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing && !isTextType ? (
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
                          {isTextType ? '\u2014' : formatPrice(pos.unitPrice)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing && !isTextType ? (
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
                          {isTextType ? '\u2014' : formatPrice(pos.flatCosts)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatPrice(pos.totalPrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing && !isTextType ? (
                        <Input
                          type="number"
                          step="0.1"
                          value={editForm.vatRate}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              vatRate: e.target.value,
                            })
                          }
                          className="h-8 text-sm text-right w-16"
                        />
                      ) : (
                        <span className="text-sm">
                          {isTextType ? '\u2014' : (pos.vatRate != null ? `${pos.vatRate}%` : '\u2014')}
                        </span>
                      )}
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
                                    : pos.freeText || pos.id,
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
                <Select
                  value={addForm.addMode}
                  onValueChange={(val) =>
                    setAddForm({
                      ...EMPTY_ADD_FORM,
                      addMode: val as 'POSITION' | 'TEXT',
                      positionType: val === 'TEXT' ? 'TEXT' : 'ARTICLE',
                    })
                  }
                >
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POSITION">{t('posTypeArticle')}/{t('posTypeFreetext')}</SelectItem>
                    <SelectItem value="TEXT">{t('posTypeText')}</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell colSpan={2}>
                {addForm.addMode === 'POSITION' ? (
                  <ArticleSearchPopover
                    value={addForm.articleId}
                    onSelect={(id, label, article?: ArticleSearchResult) =>
                      setAddForm({
                        ...addForm,
                        positionType: 'ARTICLE',
                        articleId: id,
                        articleLabel: label,
                        freeText: '',
                        unit: article?.unit || addForm.unit,
                        unitPrice: article?.buyPrice != null ? String(article.buyPrice) : addForm.unitPrice,
                        vatRate: article?.vatRate != null ? String(article.vatRate) : addForm.vatRate,
                      })
                    }
                    onFreeTextCommit={(text) =>
                      setAddForm({
                        ...addForm,
                        positionType: 'FREETEXT',
                        freeText: text,
                        articleId: '',
                        articleLabel: '',
                      })
                    }
                    placeholder={t('posArticlePlaceholder')}
                  />
                ) : (
                  <Textarea
                    value={addForm.freeText}
                    onChange={(e) =>
                      setAddForm({ ...addForm, freeText: e.target.value })
                    }
                    placeholder={t('posFreetextPlaceholder')}
                    className="text-sm min-h-[32px]"
                    rows={1}
                  />
                )}
              </TableCell>
              <TableCell>
                {addForm.addMode !== 'TEXT' && (
                  <Input
                    value={addForm.description}
                    onChange={(e) =>
                      setAddForm({ ...addForm, description: e.target.value })
                    }
                    placeholder={t('posColDescription')}
                    className="h-8 text-sm"
                  />
                )}
              </TableCell>
              <TableCell>
                {addForm.addMode !== 'TEXT' && (
                  <Input
                    type="number"
                    step="0.01"
                    value={addForm.quantity}
                    onChange={(e) =>
                      setAddForm({ ...addForm, quantity: e.target.value })
                    }
                    className="h-8 text-sm text-right w-20"
                  />
                )}
              </TableCell>
              {showReceivedCol && <TableCell />}
              <TableCell>
                {addForm.addMode !== 'TEXT' && (
                  <Input
                    value={addForm.unit}
                    onChange={(e) =>
                      setAddForm({ ...addForm, unit: e.target.value })
                    }
                    className="h-8 text-sm w-16"
                  />
                )}
              </TableCell>
              <TableCell>
                {addForm.addMode !== 'TEXT' && (
                  <Input
                    type="number"
                    step="0.01"
                    value={addForm.unitPrice}
                    onChange={(e) =>
                      setAddForm({ ...addForm, unitPrice: e.target.value })
                    }
                    className="h-8 text-sm text-right w-24"
                  />
                )}
              </TableCell>
              <TableCell>
                {addForm.addMode !== 'TEXT' && (
                  <Input
                    type="number"
                    step="0.01"
                    value={addForm.flatCosts}
                    onChange={(e) =>
                      setAddForm({ ...addForm, flatCosts: e.target.value })
                    }
                    className="h-8 text-sm text-right w-24"
                  />
                )}
              </TableCell>
              <TableCell className="text-right text-sm font-medium">
                {addForm.addMode !== 'TEXT' ? (() => {
                  const qty = parseFloat(addForm.quantity) || 0
                  const price = parseFloat(addForm.unitPrice) || 0
                  const flat = parseFloat(addForm.flatCosts) || 0
                  const total = qty * price + flat
                  return total > 0 ? formatPrice(total) : '\u2014'
                })() : '\u2014'}
              </TableCell>
              <TableCell>
                {addForm.addMode !== 'TEXT' && (
                  <Input
                    type="number"
                    step="0.1"
                    value={addForm.vatRate}
                    onChange={(e) =>
                      setAddForm({ ...addForm, vatRate: e.target.value })
                    }
                    className="h-8 text-sm text-right w-16"
                  />
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleAddPosition}
                    disabled={isAddDisabled}
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
      </div>

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
