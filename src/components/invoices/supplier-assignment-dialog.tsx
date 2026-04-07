'use client'

import * as React from 'react'
import { Search, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTRPC } from '@/trpc'
import { useQuery } from '@tanstack/react-query'
import { useAssignInboundInvoiceSupplier } from '@/hooks/useInboundInvoices'

interface Props {
  invoiceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  sellerName?: string | null
  sellerVatId?: string | null
}

export function SupplierAssignmentDialog({
  invoiceId, open, onOpenChange, sellerName, sellerVatId,
}: Props) {
  const t = useTranslations('inboundInvoices')
  const trpc = useTRPC()
  const assignSupplier = useAssignInboundInvoiceSupplier()
  const [search, setSearch] = React.useState(sellerName ?? '')

  const { data: suppliers, isLoading } = useQuery(
    trpc.crm.addresses.list.queryOptions(
      { type: 'SUPPLIER', search, page: 1, pageSize: 20 },
      { enabled: open && search.length >= 1 }
    )
  )

  const handleAssign = async (supplierId: string) => {
    try {
      await assignSupplier.mutateAsync({ id: invoiceId, supplierId })
      toast.success(t('supplier.assignSuccess'))
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('supplier.assignError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('supplier.title')}</DialogTitle>
        </DialogHeader>

        {sellerVatId && (
          <p className="text-sm text-muted-foreground">
            {t('supplier.zugferdVatId', { vatId: sellerVatId })}
          </p>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('supplier.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : suppliers?.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('supplier.noResults')}
            </p>
          ) : (
            <div className="divide-y">
              {suppliers?.items.map((s: { id: string; number: string; company: string; vatId?: string | null }) => (
                <button
                  key={s.id}
                  className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-muted/50 rounded"
                  onClick={() => handleAssign(s.id)}
                  disabled={assignSupplier.isPending}
                >
                  <div>
                    <p className="text-sm font-medium">{s.company}</p>
                    <p className="text-xs text-muted-foreground">{s.number}{s.vatId ? ` · ${s.vatId}` : ''}</p>
                  </div>
                  <Button variant="outline" size="sm" disabled={assignSupplier.isPending}>
                    {t('supplier.assignButton')}
                  </Button>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
