'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCrmAddresses } from '@/hooks'
import {
  useCreateServiceObject,
  useServiceObjects,
  useUpdateServiceObject,
} from '@/hooks/use-service-objects'

type ServiceObjectKind =
  | 'SITE'
  | 'BUILDING'
  | 'SYSTEM'
  | 'EQUIPMENT'
  | 'COMPONENT'

type ServiceObjectStatus =
  | 'OPERATIONAL'
  | 'DEGRADED'
  | 'IN_MAINTENANCE'
  | 'OUT_OF_SERVICE'
  | 'DECOMMISSIONED'

type BuildingUsage =
  | 'OFFICE'
  | 'WAREHOUSE'
  | 'PRODUCTION'
  | 'RETAIL'
  | 'RESIDENTIAL'
  | 'MIXED'
  | 'OTHER'

interface Existing {
  id: string
  number: string
  name: string
  description?: string | null
  kind: ServiceObjectKind
  parentId?: string | null
  customerAddressId: string
  internalNumber?: string | null
  manufacturer?: string | null
  model?: string | null
  serialNumber?: string | null
  yearBuilt?: number | null
  inServiceSince?: string | Date | null
  siteStreet?: string | null
  siteZip?: string | null
  siteCity?: string | null
  siteCountry?: string | null
  siteAreaSqm?: number | null
  floorCount?: number | null
  floorAreaSqm?: number | null
  buildingUsage?: BuildingUsage | null
  status: ServiceObjectStatus
  isActive?: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing?: Existing | null
  defaultCustomerAddressId?: string | null
}

// Per-kind visibility rules. Keep in sync with service-object-service.ts.
const SHOW_TECH = new Set<ServiceObjectKind>(['SYSTEM', 'EQUIPMENT', 'COMPONENT'])
const SHOW_DATES = new Set<ServiceObjectKind>([
  'BUILDING',
  'SYSTEM',
  'EQUIPMENT',
  'COMPONENT',
])
const SHOW_SITE = new Set<ServiceObjectKind>(['SITE'])
const SHOW_BUILDING = new Set<ServiceObjectKind>(['BUILDING'])

// Label for inServiceSince varies by kind.
function inServiceLabel(kind: ServiceObjectKind): string {
  return kind === 'BUILDING' ? 'Bezugsdatum' : 'Inbetriebnahme'
}

export function ServiceObjectFormSheet({
  open,
  onOpenChange,
  existing,
  defaultCustomerAddressId,
}: Props) {
  const create = useCreateServiceObject()
  const update = useUpdateServiceObject()
  const { data: addresses } = useCrmAddresses({
    page: 1,
    pageSize: 100,
    type: 'CUSTOMER',
    isActive: true,
    enabled: open,
  })

  const [number, setNumber] = React.useState('')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [kind, setKind] = React.useState<ServiceObjectKind>('EQUIPMENT')
  const [customerAddressId, setCustomerAddressId] = React.useState<string>('')
  const [parentId, setParentId] = React.useState<string>('')
  const [status, setStatus] = React.useState<ServiceObjectStatus>('OPERATIONAL')

  // Technical
  const [manufacturer, setManufacturer] = React.useState('')
  const [model, setModel] = React.useState('')
  const [serialNumber, setSerialNumber] = React.useState('')

  // Shared dates
  const [yearBuilt, setYearBuilt] = React.useState('')
  const [inServiceSince, setInServiceSince] = React.useState('')

  // SITE
  const [siteStreet, setSiteStreet] = React.useState('')
  const [siteZip, setSiteZip] = React.useState('')
  const [siteCity, setSiteCity] = React.useState('')
  const [siteCountry, setSiteCountry] = React.useState('')
  const [siteAreaSqm, setSiteAreaSqm] = React.useState('')

  // BUILDING
  const [floorCount, setFloorCount] = React.useState('')
  const [floorAreaSqm, setFloorAreaSqm] = React.useState('')
  const [buildingUsage, setBuildingUsage] =
    React.useState<BuildingUsage | ''>('')

  // Parent candidates: active service objects of the currently selected
  // customer (tenant scope is handled by the router). Self-reference is
  // filtered out below when rendering options.
  const { data: parentCandidates } = useServiceObjects({
    customerAddressId: customerAddressId || undefined,
    isActive: true,
    pageSize: 200,
  })

  React.useEffect(() => {
    if (!open) return
    if (existing) {
      setNumber(existing.number ?? '')
      setName(existing.name ?? '')
      setDescription(existing.description ?? '')
      setKind(existing.kind ?? 'EQUIPMENT')
      setCustomerAddressId(existing.customerAddressId ?? '')
      setParentId(existing.parentId ?? '')
      setStatus(existing.status ?? 'OPERATIONAL')
      setManufacturer(existing.manufacturer ?? '')
      setModel(existing.model ?? '')
      setSerialNumber(existing.serialNumber ?? '')
      setYearBuilt(
        existing.yearBuilt == null ? '' : String(existing.yearBuilt)
      )
      setInServiceSince(
        existing.inServiceSince
          ? typeof existing.inServiceSince === 'string'
            ? existing.inServiceSince.slice(0, 10)
            : (existing.inServiceSince as Date).toISOString().slice(0, 10)
          : ''
      )
      setSiteStreet(existing.siteStreet ?? '')
      setSiteZip(existing.siteZip ?? '')
      setSiteCity(existing.siteCity ?? '')
      setSiteCountry(existing.siteCountry ?? '')
      setSiteAreaSqm(
        existing.siteAreaSqm == null ? '' : String(existing.siteAreaSqm)
      )
      setFloorCount(
        existing.floorCount == null ? '' : String(existing.floorCount)
      )
      setFloorAreaSqm(
        existing.floorAreaSqm == null ? '' : String(existing.floorAreaSqm)
      )
      setBuildingUsage(existing.buildingUsage ?? '')
    } else {
      setNumber('')
      setName('')
      setDescription('')
      setKind('EQUIPMENT')
      setCustomerAddressId(defaultCustomerAddressId ?? '')
      setParentId('')
      setStatus('OPERATIONAL')
      setManufacturer('')
      setModel('')
      setSerialNumber('')
      setYearBuilt('')
      setInServiceSince('')
      setSiteStreet('')
      setSiteZip('')
      setSiteCity('')
      setSiteCountry('')
      setSiteAreaSqm('')
      setFloorCount('')
      setFloorAreaSqm('')
      setBuildingUsage('')
    }
  }, [open, existing, defaultCustomerAddressId])

  // When kind changes in the form, clear any now-hidden field so the
  // backend's strict validation doesn't reject the submit.
  const handleKindChange = React.useCallback((next: ServiceObjectKind) => {
    setKind(next)
    if (!SHOW_TECH.has(next)) {
      setManufacturer('')
      setModel('')
      setSerialNumber('')
    }
    if (!SHOW_DATES.has(next)) {
      setYearBuilt('')
      setInServiceSince('')
    }
    if (!SHOW_SITE.has(next)) {
      setSiteStreet('')
      setSiteZip('')
      setSiteCity('')
      setSiteCountry('')
      setSiteAreaSqm('')
    }
    if (!SHOW_BUILDING.has(next)) {
      setFloorCount('')
      setFloorAreaSqm('')
      setBuildingUsage('')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!number.trim() || !name.trim() || !customerAddressId) {
      toast.error('Nummer, Name und Kunde sind Pflicht')
      return
    }

    const parseIntOrNull = (s: string): number | null => {
      if (!s.trim()) return null
      const n = Number.parseInt(s, 10)
      return Number.isFinite(n) ? n : null
    }

    const payload = {
      number: number.trim(),
      name: name.trim(),
      description: description.trim() || null,
      kind,
      customerAddressId,
      parentId: parentId || null,
      status,
      // Technical — only send when visible
      manufacturer: SHOW_TECH.has(kind) ? manufacturer.trim() || null : null,
      model: SHOW_TECH.has(kind) ? model.trim() || null : null,
      serialNumber: SHOW_TECH.has(kind) ? serialNumber.trim() || null : null,
      // Dates
      yearBuilt: SHOW_DATES.has(kind) ? parseIntOrNull(yearBuilt) : null,
      inServiceSince:
        SHOW_DATES.has(kind) && inServiceSince
          ? new Date(inServiceSince).toISOString()
          : null,
      // SITE
      siteStreet: SHOW_SITE.has(kind) ? siteStreet.trim() || null : null,
      siteZip: SHOW_SITE.has(kind) ? siteZip.trim() || null : null,
      siteCity: SHOW_SITE.has(kind) ? siteCity.trim() || null : null,
      siteCountry: SHOW_SITE.has(kind) ? siteCountry.trim() || null : null,
      siteAreaSqm: SHOW_SITE.has(kind) ? parseIntOrNull(siteAreaSqm) : null,
      // BUILDING
      floorCount: SHOW_BUILDING.has(kind) ? parseIntOrNull(floorCount) : null,
      floorAreaSqm: SHOW_BUILDING.has(kind)
        ? parseIntOrNull(floorAreaSqm)
        : null,
      buildingUsage:
        SHOW_BUILDING.has(kind) && buildingUsage ? buildingUsage : null,
    }

    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, ...payload })
        toast.success('Serviceobjekt aktualisiert')
      } else {
        await create.mutateAsync(payload)
        toast.success('Serviceobjekt angelegt')
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Speichern')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {existing ? 'Serviceobjekt bearbeiten' : 'Neues Serviceobjekt'}
          </SheetTitle>
          <SheetDescription>
            Pflichtfelder: Nummer, Name, Kunde
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {/* --- Basics (all kinds) --- */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="so-number">Nummer *</Label>
              <Input
                id="so-number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                maxLength={50}
                required
              />
            </div>
            <div>
              <Label htmlFor="so-kind">Typ</Label>
              <Select
                value={kind}
                onValueChange={(v) => handleKindChange(v as ServiceObjectKind)}
              >
                <SelectTrigger id="so-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SITE">Standort</SelectItem>
                  <SelectItem value="BUILDING">Gebäude</SelectItem>
                  <SelectItem value="SYSTEM">Anlage</SelectItem>
                  <SelectItem value="EQUIPMENT">Gerät</SelectItem>
                  <SelectItem value="COMPONENT">Komponente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="so-name">Bezeichnung *</Label>
            <Input
              id="so-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              required
            />
          </div>

          <div>
            <Label htmlFor="so-customer">Kunde *</Label>
            <Select
              value={customerAddressId}
              onValueChange={(v) => {
                setCustomerAddressId(v)
                setParentId('') // customer change invalidates parent
              }}
              disabled={!!existing}
            >
              <SelectTrigger id="so-customer">
                <SelectValue placeholder="Kunde wählen" />
              </SelectTrigger>
              <SelectContent>
                {addresses?.items.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.company} ({a.number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* --- Parent (Hierarchie) --- */}
          {customerAddressId && (
            <div>
              <Label htmlFor="so-parent">Übergeordnetes Objekt</Label>
              <Select
                value={parentId || 'NONE'}
                onValueChange={(v) => setParentId(v === 'NONE' ? '' : v)}
              >
                <SelectTrigger id="so-parent">
                  <SelectValue placeholder="— oberste Ebene —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">— oberste Ebene —</SelectItem>
                  {((parentCandidates?.items ?? []) as Array<{
                    id: string
                    number: string
                    name: string
                    kind: string
                  }>)
                    .filter((c) => !existing || c.id !== existing.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.number} — {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Nur Objekte desselben Kunden verfügbar. Zyklen werden abgewiesen.
              </p>
            </div>
          )}

          {/* --- Technical (SYSTEM / EQUIPMENT / COMPONENT) --- */}
          {SHOW_TECH.has(kind) && (
            <div className="space-y-3 rounded-md border border-dashed p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Technische Angaben
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="so-manufacturer">Hersteller</Label>
                  <Input
                    id="so-manufacturer"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    maxLength={255}
                  />
                </div>
                <div>
                  <Label htmlFor="so-model">Modell</Label>
                  <Input
                    id="so-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    maxLength={255}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="so-serial">Seriennummer</Label>
                <Input
                  id="so-serial"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  maxLength={255}
                />
              </div>
            </div>
          )}

          {/* --- Dates (BUILDING + technical kinds) --- */}
          {SHOW_DATES.has(kind) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="so-year">Baujahr</Label>
                <Input
                  id="so-year"
                  type="number"
                  min={1900}
                  max={new Date().getFullYear() + 1}
                  value={yearBuilt}
                  onChange={(e) => setYearBuilt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="so-service">{inServiceLabel(kind)}</Label>
                <Input
                  id="so-service"
                  type="date"
                  value={inServiceSince}
                  onChange={(e) => setInServiceSince(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* --- SITE fields --- */}
          {SHOW_SITE.has(kind) && (
            <div className="space-y-3 rounded-md border border-dashed p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Standort-Angaben
              </p>
              <div>
                <Label htmlFor="so-site-street">Straße</Label>
                <Input
                  id="so-site-street"
                  value={siteStreet}
                  onChange={(e) => setSiteStreet(e.target.value)}
                  maxLength={255}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="so-site-zip">PLZ</Label>
                  <Input
                    id="so-site-zip"
                    value={siteZip}
                    onChange={(e) => setSiteZip(e.target.value)}
                    maxLength={20}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="so-site-city">Ort</Label>
                  <Input
                    id="so-site-city"
                    value={siteCity}
                    onChange={(e) => setSiteCity(e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="so-site-country">Land</Label>
                  <Input
                    id="so-site-country"
                    value={siteCountry}
                    onChange={(e) => setSiteCountry(e.target.value)}
                    maxLength={10}
                    placeholder="DE"
                  />
                </div>
                <div>
                  <Label htmlFor="so-site-area">Fläche (m²)</Label>
                  <Input
                    id="so-site-area"
                    type="number"
                    min={0}
                    value={siteAreaSqm}
                    onChange={(e) => setSiteAreaSqm(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* --- BUILDING fields --- */}
          {SHOW_BUILDING.has(kind) && (
            <div className="space-y-3 rounded-md border border-dashed p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Gebäude-Angaben
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="so-floor-count">Etagen</Label>
                  <Input
                    id="so-floor-count"
                    type="number"
                    min={0}
                    max={500}
                    value={floorCount}
                    onChange={(e) => setFloorCount(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="so-floor-area">Nutzfläche (m²)</Label>
                  <Input
                    id="so-floor-area"
                    type="number"
                    min={0}
                    value={floorAreaSqm}
                    onChange={(e) => setFloorAreaSqm(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="so-building-usage">Nutzungsart</Label>
                <Select
                  value={buildingUsage || 'NONE'}
                  onValueChange={(v) =>
                    setBuildingUsage(v === 'NONE' ? '' : (v as BuildingUsage))
                  }
                >
                  <SelectTrigger id="so-building-usage">
                    <SelectValue placeholder="— nicht angegeben —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— nicht angegeben —</SelectItem>
                    <SelectItem value="OFFICE">Büro</SelectItem>
                    <SelectItem value="WAREHOUSE">Lager</SelectItem>
                    <SelectItem value="PRODUCTION">Produktion</SelectItem>
                    <SelectItem value="RETAIL">Einzelhandel</SelectItem>
                    <SelectItem value="RESIDENTIAL">Wohnen</SelectItem>
                    <SelectItem value="MIXED">Gemischt</SelectItem>
                    <SelectItem value="OTHER">Sonstiges</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* --- Status + description --- */}
          <div>
            <Label htmlFor="so-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ServiceObjectStatus)}
            >
              <SelectTrigger id="so-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPERATIONAL">Betriebsbereit</SelectItem>
                <SelectItem value="DEGRADED">Eingeschränkt</SelectItem>
                <SelectItem value="IN_MAINTENANCE">In Wartung</SelectItem>
                <SelectItem value="OUT_OF_SERVICE">Außer Betrieb</SelectItem>
                <SelectItem value="DECOMMISSIONED">Stillgelegt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="so-description">Beschreibung</Label>
            <Textarea
              id="so-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
            />
          </div>

          <SheetFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {existing ? 'Speichern' : 'Anlegen'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
