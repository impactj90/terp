'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Trash2, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useServiceObject,
  useDeleteServiceObject,
} from '@/hooks/use-service-objects'
import { ServiceObjectFormSheet } from '@/components/serviceobjects/service-object-form-sheet'
import { AttachmentList } from '@/components/serviceobjects/attachment-list'
import { QrLabelButton } from '@/components/serviceobjects/qr-label-button'
import { LastServiceCard } from '@/components/serviceobjects/last-service-card'
import { ServiceObjectHistoryTab } from '@/components/serviceobjects/service-object-history-tab'
import { ServiceObjectScheduleTab } from '@/components/serviceobjects/service-object-schedule-tab'
import { WorkReportStatusBadge } from '@/components/work-reports/work-report-status-badge'
import { useWorkReportsByServiceObject } from '@/hooks/use-work-reports'
import { Plus } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  kindLabel,
  statusLabel,
  buildingUsageLabel,
} from '@/components/serviceobjects/labels'

type TabValue =
  | 'overview'
  | 'history'
  | 'workreports'
  | 'schedule'
  | 'tree'
  | 'attachments'

export default function ServiceObjectDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id as string
  const { data: obj, isLoading } = useServiceObject(id)
  const del = useDeleteServiceObject()
  const [editOpen, setEditOpen] = React.useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<TabValue>('overview')

  // Work reports for this service object (Phase 8 integration)
  const { data: workReportsData, isLoading: workReportsLoading } =
    useWorkReportsByServiceObject(id, { limit: 20 }, !!id)
  const workReports = workReportsData?.items ?? []

  if (isLoading || !obj) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  async function handleDelete() {
    try {
      const res = await del.mutateAsync({ id })
      toast.success(
        res?.mode === 'hard'
          ? 'Serviceobjekt endgültig gelöscht'
          : 'Serviceobjekt deaktiviert (verknüpfte Daten vorhanden)'
      )
      if (res?.mode === 'hard') router.push('/serviceobjects')
      setConfirmDeleteOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Löschen')
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="outline">{kindLabel(obj.kind)}</Badge>
            <Badge>{statusLabel(obj.status)}</Badge>
            {!obj.isActive && <Badge variant="secondary">inaktiv</Badge>}
          </div>
          <h1 className="text-2xl font-semibold">
            {obj.number} — {obj.name}
          </h1>
          {obj.customerAddress && (
            <p className="text-sm text-muted-foreground">
              Kunde: {obj.customerAddress.company} ({obj.customerAddress.number})
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <QrLabelButton ids={[obj.id]} />
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Bearbeiten
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Löschen
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
      >
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="history">Historie</TabsTrigger>
          <TabsTrigger value="workreports">Arbeitsscheine</TabsTrigger>
          <TabsTrigger value="schedule">Wartungsplan</TabsTrigger>
          <TabsTrigger value="tree">Hierarchie</TabsTrigger>
          <TabsTrigger value="attachments">Anhänge</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <LastServiceCard
            serviceObjectId={id}
            onViewHistory={() => setActiveTab('history')}
          />
          <Card>
            <CardHeader>
              <CardTitle>Stammdaten</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DetailRow label="Interne Nummer" value={obj.internalNumber} />
              <DetailRow
                label="QR-Code-Payload"
                value={obj.qrCodePayload}
                monospace
              />

              {/* Technical (SYSTEM / EQUIPMENT / COMPONENT) */}
              {(obj.kind === 'SYSTEM' ||
                obj.kind === 'EQUIPMENT' ||
                obj.kind === 'COMPONENT') && (
                <>
                  <DetailRow label="Hersteller" value={obj.manufacturer} />
                  <DetailRow label="Modell" value={obj.model} />
                  <DetailRow label="Seriennummer" value={obj.serialNumber} />
                </>
              )}

              {/* Dates (BUILDING + technical kinds) */}
              {(obj.kind === 'BUILDING' ||
                obj.kind === 'SYSTEM' ||
                obj.kind === 'EQUIPMENT' ||
                obj.kind === 'COMPONENT') && (
                <>
                  <DetailRow
                    label="Baujahr"
                    value={obj.yearBuilt?.toString() ?? null}
                  />
                  <DetailRow
                    label={obj.kind === 'BUILDING' ? 'Bezugsdatum' : 'Inbetriebnahme'}
                    value={
                      obj.inServiceSince
                        ? new Date(obj.inServiceSince as unknown as string)
                            .toISOString()
                            .slice(0, 10)
                        : null
                    }
                  />
                </>
              )}

              {/* SITE */}
              {obj.kind === 'SITE' && (
                <>
                  <DetailRow label="Straße" value={obj.siteStreet} />
                  <DetailRow
                    label="PLZ / Ort"
                    value={
                      [obj.siteZip, obj.siteCity].filter(Boolean).join(' ') ||
                      null
                    }
                  />
                  <DetailRow label="Land" value={obj.siteCountry} />
                  <DetailRow
                    label="Fläche"
                    value={
                      obj.siteAreaSqm != null
                        ? `${obj.siteAreaSqm.toLocaleString('de-DE')} m²`
                        : null
                    }
                  />
                </>
              )}

              {/* BUILDING */}
              {obj.kind === 'BUILDING' && (
                <>
                  <DetailRow
                    label="Etagen"
                    value={obj.floorCount?.toString() ?? null}
                  />
                  <DetailRow
                    label="Nutzfläche"
                    value={
                      obj.floorAreaSqm != null
                        ? `${obj.floorAreaSqm.toLocaleString('de-DE')} m²`
                        : null
                    }
                  />
                  <DetailRow
                    label="Nutzungsart"
                    value={buildingUsageLabel(obj.buildingUsage)}
                  />
                </>
              )}

              {obj.description && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium">Beschreibung</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {obj.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <ServiceObjectHistoryTab serviceObjectId={id} />
        </TabsContent>

        <TabsContent value="workreports" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Arbeitsscheine</CardTitle>
              <Button
                size="sm"
                onClick={() =>
                  router.push(
                    `/admin/work-reports/new?serviceObjectId=${id}`
                  )
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Neu
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {workReportsLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Lade…</div>
              ) : workReports.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-muted-foreground">
                    Noch keine Arbeitsscheine für dieses Serviceobjekt.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nr.</TableHead>
                      <TableHead>Einsatzdatum</TableHead>
                      <TableHead>Auftrag</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workReports.map((wr) => (
                      <TableRow
                        key={wr.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          router.push(`/admin/work-reports/${wr.id}`)
                        }
                      >
                        <TableCell className="font-mono font-medium">
                          {wr.code}
                        </TableCell>
                        <TableCell>
                          {wr.visitDate
                            ? (() => {
                                const [y, m, d] = wr.visitDate
                                  .slice(0, 10)
                                  .split('-')
                                return `${d}.${m}.${y}`
                              })()
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {wr.order
                            ? `${wr.order.code} — ${wr.order.name}`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <WorkReportStatusBadge status={wr.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <ServiceObjectScheduleTab serviceObjectId={id} />
        </TabsContent>

        <TabsContent value="tree">
          <Card>
            <CardHeader>
              <CardTitle>Hierarchie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {obj.parent && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Übergeordnet: </span>
                  <a
                    href={`/serviceobjects/${obj.parent.id}`}
                    className="font-medium hover:underline"
                  >
                    <Link2 className="mr-1 inline h-3 w-3" />
                    {obj.parent.number} — {obj.parent.name}
                  </a>
                </p>
              )}
              <div>
                <p className="text-sm font-medium">Untergeordnete Objekte</p>
                {obj.children && obj.children.length > 0 ? (
                  <ul className="list-inside list-disc text-sm">
                    {obj.children.map((c) => (
                      <li key={c.id}>
                        <a
                          href={`/serviceobjects/${c.id}`}
                          className="hover:underline"
                        >
                          {c.number} — {c.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Keine.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachments">
          <AttachmentList serviceObjectId={id} />
        </TabsContent>
      </Tabs>

      <ServiceObjectFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        existing={{
          id: obj.id,
          number: obj.number,
          name: obj.name,
          description: obj.description,
          kind: obj.kind,
          parentId: (obj.parent?.id as string | undefined) ?? null,
          customerAddressId: obj.customerAddressId,
          internalNumber: obj.internalNumber,
          manufacturer: obj.manufacturer,
          model: obj.model,
          serialNumber: obj.serialNumber,
          yearBuilt: obj.yearBuilt,
          inServiceSince: obj.inServiceSince as string | null | undefined,
          siteStreet: obj.siteStreet,
          siteZip: obj.siteZip,
          siteCity: obj.siteCity,
          siteCountry: obj.siteCountry,
          siteAreaSqm: obj.siteAreaSqm,
          floorCount: obj.floorCount,
          floorAreaSqm: obj.floorAreaSqm,
          buildingUsage: obj.buildingUsage,
          status: obj.status,
          isActive: obj.isActive,
        }}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Serviceobjekt löschen"
        description="Wenn verknüpfte Aufträge oder Bewegungen existieren, wird das Objekt nur deaktiviert. Ansonsten wird es endgültig gelöscht."
        confirmLabel="Löschen"
        onConfirm={handleDelete}
      />
    </div>
  )
}

function DetailRow({
  label,
  value,
  monospace = false,
}: {
  label: string
  value: string | null | undefined
  monospace?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={monospace ? 'font-mono text-sm' : 'text-sm'}>
        {value ?? '—'}
      </p>
    </div>
  )
}

