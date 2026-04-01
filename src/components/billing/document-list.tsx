'use client'

import { useTranslations } from 'next-intl'
import * as React from 'react'
import { useRouter } from 'next/navigation'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search } from 'lucide-react'
import { useBillingDocuments } from '@/hooks'
import { useCrmInquiries } from '@/hooks'
import { DocumentTypeBadge } from './document-type-badge'
import { DocumentStatusBadge } from './document-status-badge'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

interface BillingDocumentListProps {
  addressId?: string
  inquiryId?: string
}

export function BillingDocumentList({ addressId, inquiryId }: BillingDocumentListProps) {
  const t = useTranslations('billingDocuments')
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [customerFilter, setCustomerFilter] = React.useState<string>('all')
  const [inquiryFilter, setInquiryFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)

  // Load all documents (unfiltered) to extract unique customers for the filter dropdown
  const { data: allDocsData } = useBillingDocuments({ pageSize: 200 })

  // Load inquiries for filter dropdown
  const { data: inquiriesData } = useCrmInquiries({ pageSize: 100 })

  // Extract inquiries that have at least one document
  const inquiriesWithDocs = React.useMemo(() => {
    const items = allDocsData?.items ?? []
    const inquiryIds = new Set<string>()
    for (const doc of items) {
      const inqId = (doc as Record<string, unknown>).inquiryId as string | null
      if (inqId) inquiryIds.add(inqId)
    }
    return (inquiriesData?.items ?? []).filter((inq) => inquiryIds.has(inq.id))
  }, [allDocsData, inquiriesData])

  // Extract unique customers from loaded documents
  const uniqueCustomers = React.useMemo(() => {
    const items = allDocsData?.items ?? []
    const seen = new Map<string, string>()
    for (const doc of items) {
      const addr = (doc as unknown as { address?: { id: string; company: string } }).address
      if (addr && !seen.has(addr.id)) {
        seen.set(addr.id, addr.company)
      }
    }
    return Array.from(seen.entries())
      .map(([id, company]) => ({ id, company }))
      .sort((a, b) => a.company.localeCompare(b.company))
  }, [allDocsData])

  const { data, isLoading } = useBillingDocuments({
    search: search || undefined,
    type: typeFilter !== 'all' ? typeFilter as "OFFER" : undefined,
    status: statusFilter !== 'all' ? statusFilter as "DRAFT" : undefined,
    addressId: addressId ?? (customerFilter !== 'all' ? customerFilter : undefined),
    inquiryId: inquiryId ?? (inquiryFilter !== 'all' ? inquiryFilter : undefined),
    page,
    pageSize: 25,
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-2xl font-bold">{t('title')}</h2>
        <Button size="sm" onClick={() => router.push('/orders/documents/new')}>
          <Plus className="h-4 w-4 mr-1" />
          {t('newDocument')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
            <SelectTrigger className="flex-1 sm:w-48">
              <SelectValue placeholder={t('allTypes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTypes')}</SelectItem>
              <SelectItem value="OFFER">{t('typeOffer')}</SelectItem>
              <SelectItem value="ORDER_CONFIRMATION">{t('typeOrderConfirmation')}</SelectItem>
              <SelectItem value="DELIVERY_NOTE">{t('typeDeliveryNote')}</SelectItem>
              <SelectItem value="SERVICE_NOTE">{t('typeServiceNote')}</SelectItem>
              <SelectItem value="RETURN_DELIVERY">{t('typeReturnDelivery')}</SelectItem>
              <SelectItem value="INVOICE">{t('typeInvoice')}</SelectItem>
              <SelectItem value="CREDIT_NOTE">{t('typeCreditNote')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="flex-1 sm:w-40">
              <SelectValue placeholder={t('allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allStatuses')}</SelectItem>
              <SelectItem value="DRAFT">{t('statusDraft')}</SelectItem>
              <SelectItem value="PRINTED">{t('statusFinalized')}</SelectItem>
              <SelectItem value="FORWARDED">{t('statusForwarded')}</SelectItem>
              <SelectItem value="CANCELLED">{t('statusCancelled')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(!addressId || (!inquiryId && inquiriesWithDocs.length > 0)) && (
          <div className="flex items-center gap-2">
            {!addressId && (
              <Select value={customerFilter} onValueChange={(v) => { setCustomerFilter(v); setPage(1) }}>
                <SelectTrigger className="flex-1 sm:w-52">
                  <SelectValue placeholder={t('allCustomers')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allCustomers')}</SelectItem>
                  {uniqueCustomers.map((addr) => (
                    <SelectItem key={addr.id} value={addr.id}>
                      {addr.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!inquiryId && inquiriesWithDocs.length > 0 && (
              <Select value={inquiryFilter} onValueChange={(v) => { setInquiryFilter(v); setPage(1) }}>
                <SelectTrigger className="flex-1 sm:w-52">
                  <SelectValue placeholder={t('allInquiries')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allInquiries')}</SelectItem>
                  {inquiriesWithDocs.map((inq) => (
                    <SelectItem key={inq.id} value={inq.id}>
                      {inq.number} — {inq.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Mobile: card list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 sm:hidden">{t('loading')}</p>
      ) : !data?.items?.length ? (
        <p className="text-sm text-muted-foreground py-4 sm:hidden">{t('noDocumentsFound')}</p>
      ) : (
        <div className="divide-y sm:hidden">
          {data.items.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start justify-between gap-3 p-3 active:bg-muted/50 cursor-pointer"
              onClick={() => router.push(`/orders/documents/${doc.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{doc.number}</span>
                  <DocumentTypeBadge type={doc.type} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {(doc as Record<string, unknown> & { address?: { company?: string } }).address?.company ?? '-'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{formatDate(doc.documentDate)}</span>
                  <DocumentStatusBadge status={doc.status} />
                </div>
              </div>
              <span className="text-sm font-medium shrink-0">{formatCurrency(doc.totalGross)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Desktop: table */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columnNumber')}</TableHead>
              <TableHead>{t('columnType')}</TableHead>
              <TableHead>{t('columnCustomer')}</TableHead>
              <TableHead>{t('columnDate')}</TableHead>
              <TableHead className="text-right">{t('columnAmount')}</TableHead>
              <TableHead>{t('columnStatus')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t('loading')}
                </TableCell>
              </TableRow>
            ) : !data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t('noDocumentsFound')}
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((doc) => (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/orders/documents/${doc.id}`)}
                >
                  <TableCell className="font-medium">{doc.number}</TableCell>
                  <TableCell>
                    <DocumentTypeBadge type={doc.type} />
                  </TableCell>
                  <TableCell>{(doc as Record<string, unknown> & { address?: { company?: string } }).address?.company ?? '-'}</TableCell>
                  <TableCell>{formatDate(doc.documentDate)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(doc.totalGross)}</TableCell>
                  <TableCell>
                    <DocumentStatusBadge status={doc.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.total > 25 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            &lt;
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {Math.ceil(data.total / 25)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 25 >= data.total}
            onClick={() => setPage(page + 1)}
          >
            &gt;
          </Button>
        </div>
      )}
    </div>
  )
}
