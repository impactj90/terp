'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, CheckCircle, Forward, XCircle, Copy, Lock } from 'lucide-react'
import {
  useBillingDocumentById,
  useCancelBillingDocument,
  useDuplicateBillingDocument,
} from '@/hooks'
import { DocumentTypeBadge } from './document-type-badge'
import { DocumentStatusBadge } from './document-status-badge'
import { DocumentTotalsSummary } from './document-totals-summary'
import { DocumentPositionTable } from './document-position-table'
import { DocumentForwardDialog } from './document-forward-dialog'
import { DocumentFinalizeDialog } from './document-print-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'

function formatDate(date: string | Date | null): string {
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

interface DetailRowProps {
  label: string
  value: React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

interface BillingDocumentDetailProps {
  id: string
}

export function BillingDocumentDetail({ id }: BillingDocumentDetailProps) {
  const router = useRouter()
  const { data: doc, isLoading } = useBillingDocumentById(id)
  const cancelMutation = useCancelBillingDocument()
  const duplicateMutation = useDuplicateBillingDocument()

  const [showFinalizeDialog, setShowFinalizeDialog] = React.useState(false)
  const [showForwardDialog, setShowForwardDialog] = React.useState(false)
  const [showCancelDialog, setShowCancelDialog] = React.useState(false)

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Laden...</div>
  }

  if (!doc) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Beleg nicht gefunden</div>
  }

  const isDraft = doc.status === 'DRAFT'
  const isPrinted = doc.status === 'PRINTED' || doc.status === 'PARTIALLY_FORWARDED'
  const isImmutable = !isDraft

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

  return (
    <div className="space-y-6">
      {/* Header */}
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
              {(doc as unknown as { address: { company: string } }).address?.company}
            </p>
          </div>
        </div>

        {/* Action buttons */}
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

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="positions">Positionen ({(doc as unknown as { positions: unknown[] }).positions?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="chain">Kette</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Kopfdaten</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <DetailRow label="Belegnummer" value={doc.number} />
                <DetailRow label="Belegdatum" value={formatDate(doc.documentDate)} />
                <DetailRow label="Auftragsdatum" value={formatDate(doc.orderDate)} />
                <DetailRow label="Liefertermin" value={formatDate(doc.deliveryDate)} />
                <DetailRow label="Lieferart" value={doc.deliveryType ?? '-'} />
                <DetailRow label="Lieferbedingungen" value={doc.deliveryTerms ?? '-'} />
                {(doc as unknown as { order?: { code: string; name: string } }).order && (
                  <DetailRow
                    label="Verknüpfter Auftrag"
                    value={`${(doc as unknown as { order: { code: string; name: string } }).order.code} — ${(doc as unknown as { order: { code: string; name: string } }).order.name}`}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Konditionen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <DetailRow label="Zahlungsziel" value={doc.paymentTermDays != null ? `${doc.paymentTermDays} Tage` : '-'} />
                <DetailRow label="Skonto" value={doc.discountPercent != null ? `${doc.discountPercent}% / ${doc.discountDays} Tage` : '-'} />
                <DetailRow label="Versandkosten" value={formatCurrency(doc.shippingCostNet)} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bemerkungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {doc.notes && (
                <div>
                  <span className="text-sm text-muted-foreground">Bemerkungen:</span>
                  <p className="text-sm">{doc.notes}</p>
                </div>
              )}
              {doc.internalNotes && (
                <div>
                  <span className="text-sm text-muted-foreground">Interne Notizen:</span>
                  <p className="text-sm">{doc.internalNotes}</p>
                </div>
              )}
              {!doc.notes && !doc.internalNotes && (
                <p className="text-sm text-muted-foreground">Keine Bemerkungen</p>
              )}
            </CardContent>
          </Card>

          <DocumentTotalsSummary
            subtotalNet={doc.subtotalNet}
            totalVat={doc.totalVat}
            totalGross={doc.totalGross}
          />
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <DocumentPositionTable
            documentId={doc.id}
            positions={(doc as unknown as { positions: Array<{
              id: string; sortOrder: number; type: string;
              articleId?: string | null; articleNumber?: string | null;
              description?: string | null; quantity?: number | null;
              unit?: string | null; unitPrice?: number | null;
              flatCosts?: number | null; totalPrice?: number | null;
              priceType?: string | null; vatRate?: number | null;
            }> }).positions ?? []}
            readonly={isImmutable}
          />
          <DocumentTotalsSummary
            subtotalNet={doc.subtotalNet}
            totalVat={doc.totalVat}
            totalGross={doc.totalGross}
          />
        </TabsContent>

        <TabsContent value="chain" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Belegkette</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(doc as unknown as { parentDocument?: { id: string; number: string; type: string } }).parentDocument && (
                <div>
                  <span className="text-sm text-muted-foreground">Erstellt aus:</span>
                  <Button
                    variant="link"
                    className="p-0 h-auto"
                    onClick={() => router.push(`/orders/documents/${(doc as unknown as { parentDocument: { id: string } }).parentDocument.id}`)}
                  >
                    {(doc as unknown as { parentDocument: { number: string } }).parentDocument.number}
                  </Button>
                  <DocumentTypeBadge type={(doc as unknown as { parentDocument: { type: string } }).parentDocument.type} />
                </div>
              )}
              {(doc as unknown as { childDocuments?: Array<{ id: string; number: string; type: string; status: string }> }).childDocuments && (doc as unknown as { childDocuments: unknown[] }).childDocuments.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Folgebelege:</span>
                  <div className="space-y-1 mt-1">
                    {(doc as unknown as { childDocuments: Array<{ id: string; number: string; type: string; status: string }> }).childDocuments.map((child) => (
                      <div key={child.id} className="flex items-center gap-2">
                        <Button
                          variant="link"
                          className="p-0 h-auto"
                          onClick={() => router.push(`/orders/documents/${child.id}`)}
                        >
                          {child.number}
                        </Button>
                        <DocumentTypeBadge type={child.type} />
                        <DocumentStatusBadge status={child.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!(doc as unknown as { parentDocument?: unknown }).parentDocument && !(doc as unknown as { childDocuments?: unknown[] }).childDocuments?.length && (
                <p className="text-sm text-muted-foreground">Keine verknüpften Belege</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
