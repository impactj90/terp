'use client'

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
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [customerFilter, setCustomerFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)

  // Load all documents (unfiltered) to extract unique customers for the filter dropdown
  const { data: allDocsData } = useBillingDocuments({ pageSize: 200 })

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
    inquiryId,
    page,
    pageSize: 25,
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Belege</h2>
        <Button onClick={() => router.push('/orders/documents/new')}>
          <Plus className="h-4 w-4 mr-1" />
          Neuer Beleg
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Belegnummer suchen..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Alle Typen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            <SelectItem value="OFFER">Angebot</SelectItem>
            <SelectItem value="ORDER_CONFIRMATION">Auftragsbestätigung</SelectItem>
            <SelectItem value="DELIVERY_NOTE">Lieferschein</SelectItem>
            <SelectItem value="SERVICE_NOTE">Leistungsschein</SelectItem>
            <SelectItem value="RETURN_DELIVERY">Rücklieferung</SelectItem>
            <SelectItem value="INVOICE">Rechnung</SelectItem>
            <SelectItem value="CREDIT_NOTE">Gutschrift</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Alle Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="DRAFT">Entwurf</SelectItem>
            <SelectItem value="PRINTED">Gedruckt</SelectItem>
            <SelectItem value="FORWARDED">Fortgeführt</SelectItem>
            <SelectItem value="CANCELLED">Storniert</SelectItem>
          </SelectContent>
        </Select>
        {!addressId && (
          <Select value={customerFilter} onValueChange={(v) => { setCustomerFilter(v); setPage(1) }}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Alle Kunden" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kunden</SelectItem>
              {uniqueCustomers.map((addr) => (
                <SelectItem key={addr.id} value={addr.id}>
                  {addr.company}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nummer</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Kunde</TableHead>
            <TableHead>Datum</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Laden...
              </TableCell>
            </TableRow>
          ) : !data?.items?.length ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Keine Belege gefunden
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

      {/* Pagination */}
      {data && data.total > 25 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {data.total} Belege gesamt
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Zurück
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Weiter
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
