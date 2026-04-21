'use client'

import * as React from 'react'
import Link from 'next/link'
import { Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { useServiceObjects } from '@/hooks/use-service-objects'
import { ServiceObjectFormSheet } from '@/components/serviceobjects/service-object-form-sheet'
import { kindLabel, statusLabel } from '@/components/serviceobjects/labels'

type Kind = 'SITE' | 'BUILDING' | 'SYSTEM' | 'EQUIPMENT' | 'COMPONENT'
type Status =
  | 'OPERATIONAL'
  | 'DEGRADED'
  | 'IN_MAINTENANCE'
  | 'OUT_OF_SERVICE'
  | 'DECOMMISSIONED'

export default function ServiceObjectsPage() {
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [kind, setKind] = React.useState<Kind | undefined>()
  const [status, setStatus] = React.useState<Status | undefined>()
  const [isActive, setIsActive] = React.useState<boolean | undefined>(true)
  const [formOpen, setFormOpen] = React.useState(false)

  const { data, isLoading } = useServiceObjects({
    page,
    pageSize: 25,
    search: search || undefined,
    kind,
    status,
    isActive,
  })

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Serviceobjekte</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/serviceobjects/import">
              <Upload className="mr-2 h-4 w-4" /> CSV-Import
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/serviceobjects/tree">Baum-Ansicht</Link>
          </Button>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Neu
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Input
              placeholder="Suche…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              value={kind ?? 'all'}
              onValueChange={(v) => setKind(v === 'all' ? undefined : (v as Kind))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value="SITE">Standort</SelectItem>
                <SelectItem value="BUILDING">Gebäude</SelectItem>
                <SelectItem value="SYSTEM">Anlage</SelectItem>
                <SelectItem value="EQUIPMENT">Gerät</SelectItem>
                <SelectItem value="COMPONENT">Komponente</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={status ?? 'all'}
              onValueChange={(v) =>
                setStatus(v === 'all' ? undefined : (v as Status))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="OPERATIONAL">Betriebsbereit</SelectItem>
                <SelectItem value="DEGRADED">Eingeschränkt</SelectItem>
                <SelectItem value="IN_MAINTENANCE">In Wartung</SelectItem>
                <SelectItem value="OUT_OF_SERVICE">Außer Betrieb</SelectItem>
                <SelectItem value="DECOMMISSIONED">Stillgelegt</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={
                isActive === undefined ? 'all' : isActive ? 'active' : 'inactive'
              }
              onValueChange={(v) =>
                setIsActive(
                  v === 'all' ? undefined : v === 'active' ? true : false
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Aktiv" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Nur aktive</SelectItem>
                <SelectItem value="inactive">Nur inaktive</SelectItem>
                <SelectItem value="all">Alle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Kinder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((data?.items ?? []) as Array<{
                  id: string
                  number: string
                  name: string
                  kind: string
                  status: string
                  customerAddress?: { company: string } | null
                  _count?: { children?: number } | null
                }>).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        href={`/serviceobjects/${o.id}`}
                        className="font-medium hover:underline"
                      >
                        {o.number}
                      </Link>
                    </TableCell>
                    <TableCell>{o.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{kindLabel(o.kind)}</Badge>
                    </TableCell>
                    <TableCell>
                      {o.customerAddress?.company ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge>{statusLabel(o.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {o._count?.children ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.items || data.items.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Keine Serviceobjekte gefunden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.total > 25 && (
        <Pagination
          page={page}
          totalPages={Math.ceil(data.total / 25)}
          total={data.total}
          limit={25}
          onPageChange={setPage}
          onLimitChange={() => {}}
        />
      )}

      <ServiceObjectFormSheet open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
