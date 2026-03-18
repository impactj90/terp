'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Play } from 'lucide-react'
import { useBillingRecurringInvoices, useGenerateDueRecurringInvoices } from '@/hooks'
import { toast } from 'sonner'

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: 'Monatlich',
  QUARTERLY: 'Quartal',
  SEMI_ANNUALLY: 'Halbjaehrlich',
  ANNUALLY: 'Jaehrlich',
}

function formatDate(date: string | Date | null): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

export function RecurringList() {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useBillingRecurringInvoices({
    search: search || undefined,
    isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
    page,
    pageSize: 25,
  })

  const generateDueMutation = useGenerateDueRecurringInvoices()

  const handleGenerateAllDue = async () => {
    try {
      const result = await generateDueMutation.mutateAsync()
      if (result) {
        toast.success(`${result.generated} Rechnung(en) generiert, ${result.failed} fehlgeschlagen`)
      }
    } catch {
      toast.error('Fehler beim Generieren der faelligen Rechnungen')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Wiederkehrende Rechnungen</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleGenerateAllDue} disabled={generateDueMutation.isPending}>
            <Play className="h-4 w-4 mr-1" />
            Alle faelligen generieren
          </Button>
          <Button asChild>
            <Link href="/orders/recurring/new">
              <Plus className="h-4 w-4 mr-1" />
              Neue Vorlage
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Name, Notizen suchen..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-8"
          />
        </div>
        <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v); setPage(1) }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="inactive">Inaktiv</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Kunde</TableHead>
            <TableHead>Intervall</TableHead>
            <TableHead>Naechste Faelligkeit</TableHead>
            <TableHead>Letzte Generierung</TableHead>
            <TableHead>Aktiv</TableHead>
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
                Keine wiederkehrenden Rechnungen vorhanden
              </TableCell>
            </TableRow>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (data.items as any[]).map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/orders/recurring/${item.id}`)}
              >
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  {item.address?.company ?? '-'}
                </TableCell>
                <TableCell>{INTERVAL_LABELS[item.interval] ?? item.interval}</TableCell>
                <TableCell>{formatDate(item.nextDueDate)}</TableCell>
                <TableCell>{formatDate(item.lastGeneratedAt)}</TableCell>
                <TableCell>
                  <Badge variant={item.isActive ? 'default' : 'secondary'}>
                    {item.isActive ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
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
            {data.total} Eintraege gesamt
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Zurueck
            </Button>
            <span className="text-sm">Seite {page}</span>
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
