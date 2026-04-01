'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Loader2, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { useCrmAddresses } from '@/hooks/use-crm-addresses'
import {
  useWhReorderSuggestions,
  useCreateWhPOFromSuggestions,
} from '@/hooks/use-wh-purchase-orders'

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return '\u2014'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(price)
}

interface Suggestion {
  articleId: string
  articleNumber: string
  articleName: string
  currentStock: number
  minStock: number
  deficit: number
  supplierId?: string | null
  supplierName?: string | null
  suggestedQty: number
  unitPrice?: number | null
}

export function ReorderSuggestionsList() {
  const t = useTranslations('warehousePurchaseOrders')
  const router = useRouter()

  const [supplierFilter, setSupplierFilter] = React.useState<string>('ALL')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const { data: suggestions, isLoading } = useWhReorderSuggestions(
    supplierFilter !== 'ALL' ? supplierFilter : undefined
  )

  const { data: suppliersData } = useCrmAddresses({
    pageSize: 100,
    isActive: true,
  })

  const suppliers = React.useMemo(() => {
    if (!suppliersData?.items) return []
    return suppliersData.items.filter(
      (a: { type?: string }) => a.type === 'SUPPLIER' || a.type === 'BOTH'
    )
  }, [suppliersData])

  const createFromSuggestions = useCreateWhPOFromSuggestions()

  const items = (suggestions ?? []) as Suggestion[]

  function toggleSelect(articleId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(articleId)) {
        next.delete(articleId)
      } else {
        next.add(articleId)
      }
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(items.map((s) => s.articleId)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  async function handleCreatePO() {
    // Group selected articles by supplier
    const bySupplier = new Map<string, string[]>()
    for (const item of items) {
      if (!selected.has(item.articleId)) continue
      const sid = item.supplierId || ''
      if (!sid) continue
      if (!bySupplier.has(sid)) bySupplier.set(sid, [])
      bySupplier.get(sid)!.push(item.articleId)
    }

    if (bySupplier.size === 0) return

    try {
      let lastPOId: string | null = null
      for (const [supplierId, articleIds] of bySupplier) {
        const result = await createFromSuggestions.mutateAsync({
          supplierId,
          articleIds,
        })
        lastPOId = result.id
      }
      toast.success(t('suggestionsCreatedPO'))
      if (lastPOId) {
        router.push(`/warehouse/purchase-orders/${lastPOId}`)
      }
    } catch {
      toast.error('Error')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/warehouse/purchase-orders')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t('suggestionsTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('suggestionsDescription')}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select
          value={supplierFilter}
          onValueChange={(v) => {
            setSupplierFilter(v)
            setSelected(new Set())
          }}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder={t('suggestionsFilterSupplier')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">
              {t('suggestionsFilterSupplier')}
            </SelectItem>
            {suppliers.map(
              (s: { id: string; company?: string | null }) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.company || s.id}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            {t('suggestionsSelectAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>
            {t('suggestionsDeselectAll')}
          </Button>
        </div>

        {selected.size > 0 && (
          <span className="text-sm text-muted-foreground">
            {t('suggestionsSelected', { count: selected.size })}
          </span>
        )}

        <div className="hidden sm:block flex-1" />
        <Button
          size="sm"
          className="w-full sm:w-auto sm:size-default"
          onClick={handleCreatePO}
          disabled={selected.size === 0 || createFromSuggestions.isPending}
        >
          {createFromSuggestions.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ShoppingCart className="h-4 w-4 mr-2" />
          )}
          {t('suggestionsCreatePO')}
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('suggestionsNoResults')}
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="divide-y sm:hidden">
            {items.map((item) => (
              <div
                key={item.articleId}
                className="flex items-start gap-3 p-3"
                onClick={() => item.supplierId && toggleSelect(item.articleId)}
              >
                <Checkbox
                  checked={selected.has(item.articleId)}
                  onCheckedChange={() => toggleSelect(item.articleId)}
                  disabled={!item.supplierId}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.articleName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono text-muted-foreground">{item.articleNumber}</span>
                    {item.supplierName && (
                      <span className="text-xs text-muted-foreground truncate">{item.supplierName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span>{t('suggestionsColCurrentStock')}: <span className="font-mono">{item.currentStock}</span></span>
                    <span className="text-destructive font-medium">{t('suggestionsColDeficit')}: {item.deficit}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium font-mono">{item.suggestedQty}</p>
                  <p className="text-xs text-muted-foreground">{formatPrice(item.unitPrice)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead>{t('suggestionsColArticle')}</TableHead>
                  <TableHead className="w-[100px] text-right">
                    {t('suggestionsColCurrentStock')}
                  </TableHead>
                  <TableHead className="w-[100px] text-right">
                    {t('suggestionsColMinStock')}
                  </TableHead>
                  <TableHead className="w-[100px] text-right">
                    {t('suggestionsColDeficit')}
                  </TableHead>
                  <TableHead>{t('suggestionsColSupplier')}</TableHead>
                  <TableHead className="w-[100px] text-right">
                    {t('suggestionsColSuggestedQty')}
                  </TableHead>
                  <TableHead className="w-[100px] text-right">
                    {t('suggestionsColUnitPrice')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.articleId}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(item.articleId)}
                        onCheckedChange={() => toggleSelect(item.articleId)}
                        disabled={!item.supplierId}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs mr-2">
                        {item.articleNumber}
                      </span>
                      {item.articleName}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.currentStock}
                    </TableCell>
                    <TableCell className="text-right">{item.minStock}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      {item.deficit}
                    </TableCell>
                    <TableCell>
                      {item.supplierName || '\u2014'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {item.suggestedQty}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(item.unitPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
