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
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import {
  useWhArticleSuppliers,
  useAddWhArticleSupplier,
  useUpdateWhArticleSupplier,
  useRemoveWhArticleSupplier,
  useCrmAddresses,
} from '@/hooks'

interface ArticleSupplierListProps {
  articleId: string
}

interface SupplierFormState {
  supplierId: string
  supplierArticleNumber: string
  supplierDescription: string
  isPrimary: boolean
  orderUnit: string
  leadTimeDays: string
  defaultOrderQty: string
  buyPrice: string
  notes: string
}

const INITIAL_FORM: SupplierFormState = {
  supplierId: '',
  supplierArticleNumber: '',
  supplierDescription: '',
  isPrimary: false,
  orderUnit: '',
  leadTimeDays: '',
  defaultOrderQty: '',
  buyPrice: '',
  notes: '',
}

export function ArticleSupplierList({ articleId }: ArticleSupplierListProps) {
  const t = useTranslations('warehouseArticles')
  const { data: suppliers, isLoading } = useWhArticleSuppliers(articleId)
  const addSupplier = useAddWhArticleSupplier()
  const updateSupplier = useUpdateWhArticleSupplier()
  const removeSupplier = useRemoveWhArticleSupplier()
  const { data: addressData } = useCrmAddresses({ type: 'SUPPLIER', isActive: true, pageSize: 100 })

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dialogMode, setDialogMode] = React.useState<'add' | 'edit'>('add')
  const [editId, setEditId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<SupplierFormState>(INITIAL_FORM)

  function handleAdd() {
    setDialogMode('add')
    setForm(INITIAL_FORM)
    setDialogOpen(true)
  }

  function handleEdit(s: Record<string, unknown>) {
    setDialogMode('edit')
    setEditId(s.id as string)
    setForm({
      supplierId: (s.supplierId as string) || '',
      supplierArticleNumber: (s.supplierArticleNumber as string) || '',
      supplierDescription: (s.supplierDescription as string) || '',
      isPrimary: (s.isPrimary as boolean) || false,
      orderUnit: (s.orderUnit as string) || '',
      leadTimeDays: s.leadTimeDays != null ? String(s.leadTimeDays) : '',
      defaultOrderQty: s.defaultOrderQty != null ? String(s.defaultOrderQty) : '',
      buyPrice: s.buyPrice != null ? String(s.buyPrice) : '',
      notes: (s.notes as string) || '',
    })
    setDialogOpen(true)
  }

  function handleRemove(id: string) {
    removeSupplier.mutate(
      { id },
      {
        onSuccess: () => toast.success(t('toastSupplierRemoved')),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleSubmit() {
    if (dialogMode === 'add') {
      if (!form.supplierId) return
      addSupplier.mutate(
        {
          articleId,
          supplierId: form.supplierId,
          supplierArticleNumber: form.supplierArticleNumber || undefined,
          supplierDescription: form.supplierDescription || undefined,
          isPrimary: form.isPrimary,
          orderUnit: form.orderUnit || undefined,
          leadTimeDays: form.leadTimeDays ? parseInt(form.leadTimeDays) : undefined,
          defaultOrderQty: form.defaultOrderQty ? parseFloat(form.defaultOrderQty) : undefined,
          buyPrice: form.buyPrice ? parseFloat(form.buyPrice) : undefined,
          notes: form.notes || undefined,
        },
        {
          onSuccess: () => {
            toast.success(t('toastSupplierAdded'))
            setDialogOpen(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else if (editId) {
      updateSupplier.mutate(
        {
          id: editId,
          supplierArticleNumber: form.supplierArticleNumber || null,
          supplierDescription: form.supplierDescription || null,
          isPrimary: form.isPrimary,
          orderUnit: form.orderUnit || null,
          leadTimeDays: form.leadTimeDays ? parseInt(form.leadTimeDays) : null,
          defaultOrderQty: form.defaultOrderQty ? parseFloat(form.defaultOrderQty) : null,
          buyPrice: form.buyPrice ? parseFloat(form.buyPrice) : null,
          notes: form.notes || null,
        },
        {
          onSuccess: () => {
            toast.success(t('toastSupplierUpdated'))
            setDialogOpen(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('suppliersHeading')}</h3>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          {t('actionAddSupplier')}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t('loading')}</div>
      ) : !suppliers || suppliers.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          {t('noSuppliers')}
        </div>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colSupplier')}</TableHead>
              <TableHead>{t('colSupplierArticleNumber')}</TableHead>
              <TableHead>{t('labelBuyPrice')}</TableHead>
              <TableHead>{t('colLeadTime')}</TableHead>
              <TableHead>{t('colPrimarySupplier')}</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s: Record<string, unknown>) => {
              const supplier = s.supplier as { company?: string; number?: string } | null
              return (
                <TableRow key={s.id as string}>
                  <TableCell>
                    {supplier?.company || supplier?.number || '—'}
                  </TableCell>
                  <TableCell>{(s.supplierArticleNumber as string) || '—'}</TableCell>
                  <TableCell>
                    {s.buyPrice != null
                      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(s.buyPrice as number)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {s.leadTimeDays != null ? t('leadTimeDays', { count: s.leadTimeDays as number }) : '—'}
                  </TableCell>
                  <TableCell>
                    {(s.isPrimary as boolean) && <Badge variant="default">{t('badgePrimary')}</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(s)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleRemove(s.id as string)}
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
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'add' ? t('actionAddSupplier') : t('dialogEditSupplier')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {dialogMode === 'add' && (
              <div className="space-y-2">
                <Label>{t('labelSupplierRequired')}</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.supplierId}
                  onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                >
                  <option value="">{t('supplierSelectPlaceholder')}</option>
                  {addressData?.items.map((a: Record<string, unknown>) => (
                    <option key={a.id as string} value={a.id as string}>
                      {(a.number as string)} - {(a.company as string)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('labelSupplierArticleNumber')}</Label>
              <Input
                value={form.supplierArticleNumber}
                onChange={(e) => setForm({ ...form, supplierArticleNumber: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('labelBuyPrice')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.buyPrice}
                  onChange={(e) => setForm({ ...form, buyPrice: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('labelLeadTimeDays')}</Label>
                <Input
                  type="number"
                  value={form.leadTimeDays}
                  onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('labelOrderUnit')}</Label>
                <Input
                  value={form.orderUnit}
                  onChange={(e) => setForm({ ...form, orderUnit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('labelDefaultOrderQty')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.defaultOrderQty}
                  onChange={(e) => setForm({ ...form, defaultOrderQty: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>{t('labelPrimarySupplier')}</Label>
              <Switch
                checked={form.isPrimary}
                onCheckedChange={(checked) => setForm({ ...form, isPrimary: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={dialogMode === 'add' && !form.supplierId}
            >
              {(addSupplier.isPending || updateSupplier.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {dialogMode === 'add' ? t('actionAdd') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
