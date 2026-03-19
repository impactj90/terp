'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowLeft, CheckCircle, Forward, XCircle, Copy, Lock,
  ChevronRight, ChevronLeft, FileDown,
} from 'lucide-react'
import {
  useBillingDocumentById,
  useUpdateBillingDocument,
  useCancelBillingDocument,
  useDuplicateBillingDocument,
  useDownloadBillingDocumentPdf,
  useBillingTenantConfig,
  useBillingDocumentTemplatesByType,
} from '@/hooks'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BillingDocumentType } from '@/generated/prisma/client'
import { DocumentTypeBadge } from './document-type-badge'
import { DocumentStatusBadge } from './document-status-badge'
import { DocumentPositionTable } from './document-position-table'
import { DocumentForwardDialog } from './document-forward-dialog'
import { DocumentFinalizeDialog } from './document-print-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'

// --- Helpers ---

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('de-DE').format(new Date(date))
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

// --- Type labels ---

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  OFFER: 'Angebot',
  ORDER_CONFIRMATION: 'Auftragsbestätigung',
  DELIVERY_NOTE: 'Lieferschein',
  SERVICE_NOTE: 'Leistungsschein',
  RETURN_DELIVERY: 'Rücklieferschein',
  INVOICE: 'Rechnung',
  CREDIT_NOTE: 'Gutschrift',
}

// --- Doc type helpers to avoid `as unknown as` casts ---

interface DocAddress {
  company?: string | null
  street?: string | null
  zip?: string | null
  city?: string | null
}
interface DocRelated { id: string; number: string; type: string; status?: string }
interface DocInquiry { id: string; number: string; title: string }
interface DocOrder { id: string; code: string; name: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
function getDocField<T>(doc: any, field: string): T | undefined {
  return doc?.[field] as T | undefined
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- Sidebar editable field (blur-save) ---

function EditableField({
  label,
  value,
  field,
  type = 'text',
  editable,
  onSave,
}: {
  label: string
  value: string | number | null | undefined
  field: string
  type?: 'text' | 'number'
  editable: boolean
  onSave: (field: string, val: string | number | null) => void
}) {
  if (!editable) {
    return (
      <div className="flex justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-xs">{value != null ? String(value) : '-'}</span>
      </div>
    )
  }
  return (
    <div className="space-y-0.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        className="h-7 text-xs"
        type={type}
        defaultValue={value != null ? String(value) : ''}
        onBlur={(e) => {
          const raw = e.target.value.trim()
          if (type === 'number') {
            onSave(field, raw ? Number(raw) : null)
          } else {
            onSave(field, raw || null)
          }
        }}
      />
    </div>
  )
}

// --- Main Component ---

interface DocumentEditorProps {
  id: string
}

export function DocumentEditor({ id }: DocumentEditorProps) {
  const router = useRouter()
  const { data: doc, isLoading } = useBillingDocumentById(id)
  const { data: tenantConfig } = useBillingTenantConfig()
  const { data: templates = [] } = useBillingDocumentTemplatesByType(
    (doc?.type ?? 'OFFER') as BillingDocumentType
  )
  const updateMutation = useUpdateBillingDocument()
  const cancelMutation = useCancelBillingDocument()
  const duplicateMutation = useDuplicateBillingDocument()
  const downloadPdfMutation = useDownloadBillingDocumentPdf()

  const [showFinalizeDialog, setShowFinalizeDialog] = React.useState(false)
  const [showForwardDialog, setShowForwardDialog] = React.useState(false)
  const [showCancelDialog, setShowCancelDialog] = React.useState(false)
  const [sidebarOpen, setSidebarOpen] = React.useState(true)

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Laden...</div>
  }
  if (!doc) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Beleg nicht gefunden</div>
  }

  const isDraft = doc.status === 'DRAFT'
  const isPrinted = doc.status === 'PRINTED' || doc.status === 'PARTIALLY_FORWARDED'
  const isImmutable = !isDraft

  const address = getDocField<DocAddress>(doc, 'address')
  const parentDocument = getDocField<DocRelated>(doc, 'parentDocument')
  const childDocuments = getDocField<DocRelated[]>(doc, 'childDocuments') ?? []
  const inquiry = getDocField<DocInquiry>(doc, 'inquiry')
  const order = getDocField<DocOrder>(doc, 'order')
  const positions = getDocField<Array<{
    id: string; sortOrder: number; type: string;
    articleId?: string | null; articleNumber?: string | null;
    description?: string | null; quantity?: number | null;
    unit?: string | null; unitPrice?: number | null;
    flatCosts?: number | null; totalPrice?: number | null;
    priceType?: string | null; vatRate?: number | null;
  }>>(doc, 'positions') ?? []

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ id: doc.id })
      toast.success('Beleg storniert')
      setShowCancelDialog(false)
    } catch {
      toast.error('Fehler beim Stornieren')
    }
  }

  const handleDuplicate = async () => {
    try {
      const result = await duplicateMutation.mutateAsync({ id: doc.id })
      toast.success('Beleg dupliziert')
      if (result?.id) {
        router.push(`/orders/documents/${result.id}`)
      }
    } catch {
      toast.error('Fehler beim Duplizieren')
    }
  }

  const handleSidebarField = (field: string, val: string | number | null) => {
    updateMutation.mutate({ id: doc.id, [field]: val })
  }

  const handleApplyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) return

    const hasContent = (doc as Record<string, unknown>).headerText || (doc as Record<string, unknown>).footerText
    if (hasContent) {
      if (!window.confirm('Kopf- und Schlusstext werden überschrieben. Fortfahren?')) return
    }

    updateMutation.mutate({
      id: doc.id,
      headerText: tpl.headerText ?? null,
      footerText: tpl.footerText ?? null,
    })
    toast.success(`Vorlage "${tpl.name}" angewendet`)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/orders/documents')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{doc.number}</h2>
              <DocumentTypeBadge type={doc.type} />
              <DocumentStatusBadge status={doc.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {address?.company}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDraft && (
            <Button onClick={() => setShowFinalizeDialog(true)}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Abschließen
            </Button>
          )}
          {isPrinted && (
            <Button onClick={() => setShowForwardDialog(true)}>
              <Forward className="h-4 w-4 mr-1" />
              Fortführen
            </Button>
          )}
          {doc.status !== 'CANCELLED' && doc.status !== 'FORWARDED' && (
            <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
              <XCircle className="h-4 w-4 mr-1" />
              Stornieren
            </Button>
          )}
          <Button variant="outline" onClick={handleDuplicate} disabled={duplicateMutation.isPending}>
            <Copy className="h-4 w-4 mr-1" />
            Duplizieren
          </Button>
          {isDraft && templates.length > 0 && (
            <Select onValueChange={handleApplyTemplate}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Vorlage anwenden..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isImmutable && (
            <Button
              variant="outline"
              disabled={downloadPdfMutation.isPending}
              onClick={async () => {
                try {
                  const result = await downloadPdfMutation.mutateAsync({ id: doc.id })
                  if (result?.signedUrl) {
                    window.open(result.signedUrl, '_blank')
                  }
                } catch {
                  toast.error('PDF-Download fehlgeschlagen')
                }
              }}
            >
              <FileDown className="h-4 w-4 mr-1" />
              {downloadPdfMutation.isPending ? 'Lade PDF...' : 'PDF'}
            </Button>
          )}
        </div>
      </div>

      {/* Immutable notice */}
      {isImmutable && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Dieser Beleg ist festgeschrieben und kann nicht mehr bearbeitet werden.
          </AlertDescription>
        </Alert>
      )}

      {/* Main content: A4 page + sidebar */}
      <div className="flex gap-4">
        {/* A4 Document Canvas */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div
            className="bg-muted/30 p-8 min-h-screen"
            data-testid="document-canvas"
          >
            <div
              className="document-paper bg-white shadow-md mx-auto relative"
              data-testid="document-page"
              style={{
                width: '210mm',
                minHeight: '297mm',
                padding: '20mm 25mm 15mm 25mm',
              }}
            >
              {/* Absender-Zeile (small sender line) */}
              <div className="text-[7pt] text-gray-400 mb-1 border-b border-gray-200 pb-1">
                {tenantConfig?.companyName
                  ? `${tenantConfig.companyName} · ${tenantConfig.companyAddress?.replace(/\n/g, ' · ') ?? ''}`
                  : <span className="italic">Briefpapier nicht konfiguriert</span>
                }
              </div>

              {/* Logo (top right, absolute) */}
              {tenantConfig?.logoUrl && (
                <div className="absolute top-[20mm] right-[25mm]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tenantConfig.logoUrl}
                    alt="Logo"
                    className="max-h-16 max-w-[50mm] object-contain"
                  />
                </div>
              )}

              {/* Empfänger-Adresse */}
              <div className="mt-4 mb-8 max-w-[85mm]">
                <p className="text-sm font-medium">{address?.company}</p>
                {address?.street && <p className="text-sm">{address.street}</p>}
                {(address?.zip || address?.city) && (
                  <p className="text-sm">{[address.zip, address.city].filter(Boolean).join(' ')}</p>
                )}
              </div>

              {/* Beleg-Info Block */}
              <div className="mb-6">
                <h1 className="text-lg font-bold mb-2">
                  {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                </h1>
                <div className="text-sm space-y-0.5">
                  <div>Nr.: {doc.number}</div>
                  <div>Datum: {formatDate(doc.documentDate)}</div>
                  {doc.deliveryDate && <div>Liefertermin: {formatDate(doc.deliveryDate)}</div>}
                  {doc.orderDate && <div>Auftragsdatum: {formatDate(doc.orderDate)}</div>}
                </div>
              </div>

              {/* Header Text */}
              <div
                className={`mb-6 min-h-[2em] ${isDraft ? 'bg-blue-50/60 rounded px-2 py-1 -mx-2' : ''}`}
                data-testid="header-text-area"
              >
                <RichTextEditor
                  content={((doc as Record<string, unknown>).headerText as string) ?? ''}
                  onUpdate={(html) => updateMutation.mutate({
                    id: doc.id,
                    headerText: html || null,
                  })}
                  placeholder="Einleitungstext eingeben..."
                  editable={isDraft}
                />
              </div>

              {/* Positionstabelle */}
              <div className="mb-4" data-testid="position-table-area">
                <DocumentPositionTable
                  documentId={doc.id}
                  positions={positions}
                  readonly={isImmutable}
                  addressId={doc.addressId ?? undefined}
                />
              </div>

              {/* Summenblock (right-aligned) */}
              <div className="flex justify-end mb-6" data-testid="totals-area">
                <div className="w-64 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Netto</span>
                    <span>{formatCurrency(doc.subtotalNet)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MwSt</span>
                    <span>{formatCurrency(doc.totalVat)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>Brutto</span>
                    <span>{formatCurrency(doc.totalGross)}</span>
                  </div>
                </div>
              </div>

              {/* Footer Text */}
              <div
                className={`mb-8 min-h-[2em] ${isDraft ? 'bg-blue-50/60 rounded px-2 py-1 -mx-2' : ''}`}
                data-testid="footer-text-area"
              >
                <RichTextEditor
                  content={((doc as Record<string, unknown>).footerText as string) ?? ''}
                  onUpdate={(html) => updateMutation.mutate({
                    id: doc.id,
                    footerText: html || null,
                  })}
                  placeholder="Schlusstext / Zahlungsbedingungen..."
                  editable={isDraft}
                />
              </div>

              {/* Fußzeile (tenant config footer, bottom of page) */}
              <div
                className="absolute bottom-[10mm] left-[25mm] right-[25mm] border-t border-gray-200 pt-2"
                data-testid="fusszeile"
              >
                {tenantConfig?.footerHtml ? (
                  <div
                    className="text-[7pt] text-gray-500"
                    dangerouslySetInnerHTML={{ __html: tenantConfig.footerHtml }}
                  />
                ) : tenantConfig?.companyName ? (
                  <div className="flex justify-between text-[7pt] text-gray-500">
                    <div>
                      <div className="font-medium">{tenantConfig.companyName}</div>
                      {tenantConfig.companyAddress?.split('\n').map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                      {tenantConfig.phone && <div>Tel: {tenantConfig.phone}</div>}
                      {tenantConfig.email && <div>{tenantConfig.email}</div>}
                    </div>
                    <div>
                      {tenantConfig.bankName && <div>{tenantConfig.bankName}</div>}
                      {tenantConfig.iban && <div>IBAN: {tenantConfig.iban}</div>}
                      {tenantConfig.bic && <div>BIC: {tenantConfig.bic}</div>}
                    </div>
                    <div>
                      {tenantConfig.taxId && <div>USt-IdNr.: {tenantConfig.taxId}</div>}
                      {tenantConfig.commercialRegister && <div>{tenantConfig.commercialRegister}</div>}
                      {tenantConfig.managingDirector && <div>GF: {tenantConfig.managingDirector}</div>}
                    </div>
                  </div>
                ) : (
                  <p className="text-[7pt] text-gray-300 italic">
                    Briefpapier nicht konfiguriert
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar (collapsible) */}
        <div className={`shrink-0 transition-all duration-200 ${sidebarOpen ? 'w-80' : 'w-8'}`}>
          <div className="sticky top-4">
            <Button
              variant="ghost"
              size="icon"
              className="mb-2"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>

            {sidebarOpen && (
              <div className="space-y-6">
                {/* Belegkette */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Belegkette</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {parentDocument && (
                      <div>
                        <span className="text-muted-foreground text-xs">Erstellt aus:</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Button
                            variant="link"
                            className="p-0 h-auto text-sm"
                            onClick={() => router.push(`/orders/documents/${parentDocument.id}`)}
                          >
                            {parentDocument.number}
                          </Button>
                          <DocumentTypeBadge type={parentDocument.type} />
                        </div>
                      </div>
                    )}
                    {childDocuments.length > 0 && (
                      <div>
                        <span className="text-muted-foreground text-xs">Folgebelege:</span>
                        <div className="space-y-1 mt-0.5">
                          {childDocuments.map((child) => (
                            <div key={child.id} className="flex items-center gap-1">
                              <Button
                                variant="link"
                                className="p-0 h-auto text-sm"
                                onClick={() => router.push(`/orders/documents/${child.id}`)}
                              >
                                {child.number}
                              </Button>
                              <DocumentTypeBadge type={child.type} />
                              {child.status && <DocumentStatusBadge status={child.status} />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!parentDocument && childDocuments.length === 0 && (
                      <p className="text-muted-foreground text-xs">Keine verknüpften Belege</p>
                    )}
                  </CardContent>
                </Card>

                {/* Metadaten */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Metadaten</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Erstellt</span>
                      <span className="text-xs">{formatDate(doc.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Gedruckt</span>
                      <span className="text-xs">{formatDate((doc as Record<string, unknown>).printedAt as string | null)}</span>
                    </div>
                    {inquiry && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Anfrage</span>
                        <span className="text-xs">{inquiry.number}</span>
                      </div>
                    )}
                    {order && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Auftrag</span>
                        <span className="text-xs">{order.code}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Konditionen */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Konditionen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <EditableField label="Zahlungsziel (Tage)" value={doc.paymentTermDays} field="paymentTermDays" type="number" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label="Skonto (%)" value={doc.discountPercent} field="discountPercent" type="number" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label="Skonto Tage" value={doc.discountDays} field="discountDays" type="number" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label="Versandkosten (netto)" value={doc.shippingCostNet} field="shippingCostNet" type="number" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label="Lieferart" value={doc.deliveryType} field="deliveryType" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label="Lieferbedingungen" value={doc.deliveryTerms} field="deliveryTerms" editable={isDraft} onSave={handleSidebarField} />
                  </CardContent>
                </Card>

                {/* Bemerkungen */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Bemerkungen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {isDraft ? (
                      <>
                        <div className="space-y-0.5">
                          <Label className="text-xs text-muted-foreground">Bemerkungen</Label>
                          <Textarea
                            className="text-xs min-h-[60px]"
                            defaultValue={doc.notes ?? ''}
                            placeholder="Bemerkungen..."
                            onBlur={(e) => handleSidebarField('notes', e.target.value.trim() || null)}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-xs text-muted-foreground">Interne Notizen</Label>
                          <Textarea
                            className="text-xs min-h-[60px]"
                            defaultValue={doc.internalNotes ?? ''}
                            placeholder="Interne Notizen..."
                            onBlur={(e) => handleSidebarField('internalNotes', e.target.value.trim() || null)}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        {doc.notes ? (
                          <div>
                            <span className="text-muted-foreground text-xs">Bemerkungen:</span>
                            <p className="text-xs mt-0.5">{doc.notes}</p>
                          </div>
                        ) : null}
                        {doc.internalNotes ? (
                          <div>
                            <span className="text-muted-foreground text-xs">Intern:</span>
                            <p className="text-xs mt-0.5">{doc.internalNotes}</p>
                          </div>
                        ) : null}
                        {!doc.notes && !doc.internalNotes && (
                          <p className="text-muted-foreground text-xs">Keine Bemerkungen</p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <DocumentFinalizeDialog
        open={showFinalizeDialog}
        onOpenChange={setShowFinalizeDialog}
        documentId={doc.id}
        documentNumber={doc.number}
        documentType={doc.type}
      />
      <DocumentForwardDialog
        open={showForwardDialog}
        onOpenChange={setShowForwardDialog}
        documentId={doc.id}
        documentType={doc.type}
        documentNumber={doc.number}
      />
      <ConfirmDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title="Beleg stornieren"
        description={`Sind Sie sicher, dass Sie Beleg ${doc.number} stornieren möchten?`}
        onConfirm={handleCancel}
        confirmLabel="Stornieren"
        variant="destructive"
      />
    </div>
  )
}
