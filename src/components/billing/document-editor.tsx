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
  ArrowLeft, CheckCircle, Forward, XCircle, Copy, Lock, Mail,
  ChevronRight, ChevronLeft, FileDown, FileCode, FilePlus2, Loader2,
} from 'lucide-react'
import {
  useBillingDocumentById,
  useUpdateBillingDocument,
  useCancelBillingDocument,
  useDuplicateBillingDocument,
  useDownloadBillingDocumentPdf,
  useDownloadBillingDocumentXml,
  useGenerateBillingDocumentEInvoice,
  useBillingTenantConfig,
  useBillingDocumentTemplatesByType,
} from '@/hooks'
import { useCrmInquiries } from '@/hooks'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { EmailComposeDialog } from '@/components/email/email-compose-dialog'
import { EmailSendLog } from '@/components/email/email-send-log'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

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

const DOC_TYPE_KEYS: Record<string, string> = {
  OFFER: 'typeOffer',
  ORDER_CONFIRMATION: 'typeOrderConfirmation',
  DELIVERY_NOTE: 'typeDeliveryNote',
  SERVICE_NOTE: 'typeServiceNote',
  RETURN_DELIVERY: 'typeReturnDelivery',
  INVOICE: 'typeInvoice',
  CREDIT_NOTE: 'typeCreditNote',
}

// --- Doc type helpers to avoid `as unknown as` casts ---

interface DocAddress {
  company?: string | null
  street?: string | null
  zip?: string | null
  city?: string | null
}
interface DocContact {
  firstName?: string | null
  lastName?: string | null
  salutation?: string | null
  title?: string | null
  letterSalutation?: string | null
}
interface DocRelated { id: string; number: string; type: string; status?: string }
interface DocInquiry { id: string; number: string; title: string }
interface DocOrder { id: string; code: string; name: string }

/**
 * Resolve template placeholders with document context data.
 * Supports both German and English placeholder names.
 */
function resolveTemplatePlaceholders(
  html: string,
  address?: DocAddress | null,
  contact?: DocContact | null,
): string {
  const placeholders: Record<string, string> = {
    // German
    briefanrede: contact?.letterSalutation || 'Sehr geehrte Damen und Herren,',
    anrede: contact?.salutation ?? '',
    titel: contact?.title ?? '',
    vorname: contact?.firstName ?? '',
    nachname: contact?.lastName ?? '',
    firma: address?.company ?? '',
    // English
    lettersalutation: contact?.letterSalutation || 'Dear Sir or Madam,',
    salutation: contact?.salutation ?? '',
    title: contact?.title ?? '',
    firstname: contact?.firstName ?? '',
    lastname: contact?.lastName ?? '',
    company: address?.company ?? '',
  }

  return html.replace(/\{\{(\w+)\}\}/gi, (match, key: string) => {
    const val = placeholders[key.toLowerCase()]
    return val !== undefined ? val : match
  })
}

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
  const { data: doc, isLoading, refetch: refetchDoc } = useBillingDocumentById(id)
  const { data: tenantConfig } = useBillingTenantConfig()
  const { data: templates = [] } = useBillingDocumentTemplatesByType(
    (doc?.type ?? 'OFFER') as BillingDocumentType
  )
  const updateMutation = useUpdateBillingDocument()
  const cancelMutation = useCancelBillingDocument()
  const duplicateMutation = useDuplicateBillingDocument()
  const downloadPdfMutation = useDownloadBillingDocumentPdf()
  const downloadXmlMutation = useDownloadBillingDocumentXml()
  const generateEInvoiceMutation = useGenerateBillingDocumentEInvoice()

  const t = useTranslations('billingDocuments')
  const tc = useTranslations('common')
  const tCompose = useTranslations('emailCompose')

  // Load inquiries for Vorgang select (only for DRAFT documents)
  const { data: inquiryData } = useCrmInquiries({
    addressId: doc?.addressId ?? undefined,
    pageSize: 100,
    enabled: doc?.status === 'DRAFT' && !!doc?.addressId,
  })
  const activeInquiries = React.useMemo(
    () => (inquiryData?.items ?? []).filter(
      (inq) => inq.status === 'OPEN' || inq.status === 'IN_PROGRESS'
    ),
    [inquiryData]
  )

  const [showFinalizeDialog, setShowFinalizeDialog] = React.useState(false)
  const [showForwardDialog, setShowForwardDialog] = React.useState(false)
  const [showCancelDialog, setShowCancelDialog] = React.useState(false)
  const [showEmailDialog, setShowEmailDialog] = React.useState(false)
  const [sidebarOpen, setSidebarOpen] = React.useState(true)

  // E-Invoice validation (client-side check for finalize dialog warning)
  const eInvoiceMissingFields = React.useMemo(() => {
    if (!tenantConfig?.eInvoiceEnabled || !doc) return []
    if (doc.type !== 'INVOICE' && doc.type !== 'CREDIT_NOTE') return []
    const missing: string[] = []
    if (!tenantConfig.companyName) missing.push(t('companyNameSetting'))
    if (!tenantConfig.companyStreet) missing.push(t('companyStreetSetting'))
    if (!tenantConfig.companyZip) missing.push(t('companyZipSetting'))
    if (!tenantConfig.companyCity) missing.push(t('companyCitySetting'))
    if (!tenantConfig.taxId && !tenantConfig.taxNumber) missing.push(t('taxIdOrNumberSetting'))
    const addr = doc.address as Record<string, unknown> | undefined
    if (!addr?.company) missing.push(t('customerNameAddress'))
    if (!addr?.street) missing.push(t('streetAddress'))
    if (!addr?.zip) missing.push(t('zipAddress'))
    if (!addr?.city) missing.push(t('cityAddress'))
    if (!addr?.country) missing.push(t('countryAddress'))
    return missing
  }, [tenantConfig, doc])

  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">{t('loading')}</div>
  }
  if (!doc) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">{t('notFound')}</div>
  }

  const isDraft = doc.status === 'DRAFT'
  const isPrinted = doc.status === 'PRINTED' || doc.status === 'PARTIALLY_FORWARDED'
  const isImmutable = !isDraft

  const address = getDocField<DocAddress>(doc, 'address')
  const contact = getDocField<DocContact>(doc, 'contact')
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
      toast.success(t('documentCancelled'))
      setShowCancelDialog(false)
    } catch {
      toast.error(t('cancelError'))
    }
  }

  const handleDuplicate = async () => {
    try {
      const result = await duplicateMutation.mutateAsync({ id: doc.id })
      toast.success(t('documentDuplicated'))
      if (result?.id) {
        router.push(`/orders/documents/${result.id}`)
      }
    } catch {
      toast.error(t('duplicateError'))
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
      if (!window.confirm(t('templateOverwriteConfirm'))) return
    }

    // Resolve placeholders like {{briefanrede}} / {{letterSalutation}} with contact/address data
    const resolvedHeader = tpl.headerText
      ? resolveTemplatePlaceholders(tpl.headerText, address, contact)
      : null
    const resolvedFooter = tpl.footerText
      ? resolveTemplatePlaceholders(tpl.footerText, address, contact)
      : null

    updateMutation.mutate({
      id: doc.id,
      headerText: resolvedHeader,
      footerText: resolvedFooter,
    })
    toast.success(t('templateApplied', { name: tpl.name }))
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => router.push('/orders/documents')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tc('goBack')}</TooltipContent>
          </Tooltip>
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
              {t('finalize')}
            </Button>
          )}
          {isPrinted && (
            <Button onClick={() => setShowForwardDialog(true)}>
              <Forward className="h-4 w-4 mr-1" />
              {t('forward')}
            </Button>
          )}
          {doc.status !== 'CANCELLED' && doc.status !== 'FORWARDED' && (
            <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
              <XCircle className="h-4 w-4 mr-1" />
              {t('cancelDocument')}
            </Button>
          )}
          <Button variant="outline" onClick={handleDuplicate} disabled={duplicateMutation.isPending}>
            <Copy className="h-4 w-4 mr-1" />
            {t('duplicate')}
          </Button>
          {isDraft && templates.length > 0 && (
            <Select onValueChange={handleApplyTemplate}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t('applyTemplate')} />
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
                  toast.error(t('pdfDownloadFailed'))
                }
              }}
            >
              <FileDown className="h-4 w-4 mr-1" />
              {downloadPdfMutation.isPending ? t('loadingPdf') : t('pdfDownload')}
            </Button>
          )}
          {isImmutable && (
            <Button variant="outline" onClick={() => setShowEmailDialog(true)}>
              <Mail className="h-4 w-4 mr-1" />
              {tCompose('sendEmail')}
            </Button>
          )}
          {isImmutable && !!(doc as Record<string, unknown>).eInvoiceXmlUrl && (doc.type === 'INVOICE' || doc.type === 'CREDIT_NOTE') && (
            <Button
              variant="outline"
              disabled={downloadXmlMutation.isPending}
              onClick={async () => {
                try {
                  const result = await downloadXmlMutation.mutateAsync({ id: doc.id })
                  if (result?.signedUrl) {
                    window.open(result.signedUrl, '_blank')
                  }
                } catch {
                  toast.error(t('xmlDownloadFailed'))
                }
              }}
            >
              <FileCode className="h-4 w-4 mr-1" />
              {downloadXmlMutation.isPending ? t('loadingXml') : t('eInvoiceXmlDownload')}
            </Button>
          )}
          {isImmutable && !(doc as Record<string, unknown>).eInvoiceXmlUrl && (doc.type === 'INVOICE' || doc.type === 'CREDIT_NOTE') && tenantConfig?.eInvoiceEnabled && (
            <Button
              variant="outline"
              disabled={generateEInvoiceMutation.isPending}
              onClick={async () => {
                try {
                  await generateEInvoiceMutation.mutateAsync({ id: doc.id })
                  toast.success(t('eInvoiceGenerated'))
                  await refetchDoc()
                } catch {
                  toast.error(t('eInvoiceGenerationFailed'))
                }
              }}
            >
              {generateEInvoiceMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <FilePlus2 className="h-4 w-4 mr-1" />
              )}
              {generateEInvoiceMutation.isPending ? t('loadingXml') : t('generateEInvoice')}
            </Button>
          )}
        </div>
      </div>

      {/* Immutable notice */}
      {isImmutable && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            {t('immutableNotice')}
          </AlertDescription>
        </Alert>
      )}

      {/* Main content: A4 page + sidebar */}
      <div className="flex gap-4">
        {/* A4 Document Canvas */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div
            className="bg-muted/30 p-8 min-h-dvh"
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
                  : <span className="italic">{t('letterheadNotConfigured')}</span>
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
                  {DOC_TYPE_KEYS[doc.type] ? t(DOC_TYPE_KEYS[doc.type] as any) : doc.type}
                </h1>
                <div className="text-sm space-y-0.5">
                  <div>{t('numberLabel')}{doc.number}</div>
                  <div>{t('dateLabel')}{formatDate(doc.documentDate)}</div>
                  {doc.deliveryDate && <div>{t('deliveryDateLabel')}{formatDate(doc.deliveryDate)}</div>}
                  {doc.orderDate && <div>{t('orderDateLabel')}{formatDate(doc.orderDate)}</div>}
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
                  placeholder={t('introTextPlaceholder')}
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
                    <span className="text-muted-foreground">{t('net')}</span>
                    <span>{formatCurrency(doc.subtotalNet)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('vat')}</span>
                    <span>{formatCurrency(doc.totalVat)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>{t('gross')}</span>
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
                  placeholder={t('footerTextPlaceholder')}
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
                      {tenantConfig.phone && <div>{t('phoneLabel')}{tenantConfig.phone}</div>}
                      {tenantConfig.email && <div>{tenantConfig.email}</div>}
                    </div>
                    <div>
                      {tenantConfig.bankName && <div>{tenantConfig.bankName}</div>}
                      {tenantConfig.iban && <div>{t('ibanLabel')}{tenantConfig.iban}</div>}
                      {tenantConfig.bic && <div>{t('bicLabel')}{tenantConfig.bic}</div>}
                    </div>
                    <div>
                      {tenantConfig.taxId && <div>{t('vatIdLabel')}{tenantConfig.taxId}</div>}
                      {tenantConfig.commercialRegister && <div>{tenantConfig.commercialRegister}</div>}
                      {tenantConfig.managingDirector && <div>{t('mdLabel')}{tenantConfig.managingDirector}</div>}
                    </div>
                  </div>
                ) : (
                  <p className="text-[7pt] text-gray-300 italic">
                    {t('letterheadNotConfigured')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar (collapsible) */}
        <div className={`shrink-0 transition-all duration-200 ${sidebarOpen ? 'w-80' : 'w-8'}`}>
          <div className="sticky top-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mb-2"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  {sidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tc('togglePanel')}</TooltipContent>
            </Tooltip>

            {sidebarOpen && (
              <div className="space-y-6">
                {/* Belegkette */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('documentChain')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {parentDocument && (
                      <div>
                        <span className="text-muted-foreground text-xs">{t('createdFrom')}</span>
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
                        <span className="text-muted-foreground text-xs">{t('followUpDocuments')}</span>
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
                      <p className="text-muted-foreground text-xs">{t('noLinkedDocuments')}</p>
                    )}
                  </CardContent>
                </Card>

                {/* Metadaten */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('metadata')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">{t('created')}</span>
                      <span className="text-xs">{formatDate(doc.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">{t('printed')}</span>
                      <span className="text-xs">{formatDate((doc as Record<string, unknown>).printedAt as string | null)}</span>
                    </div>
                    {isDraft && activeInquiries.length > 0 ? (
                      <div className="space-y-0.5">
                        <Label className="text-xs text-muted-foreground">{t('inquiry')}</Label>
                        <Select
                          value={inquiry?.id ?? 'none'}
                          onValueChange={(v) => handleSidebarField('inquiryId', v === 'none' ? null : v)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('noInquiry')}</SelectItem>
                            {activeInquiries.map((inq) => (
                              <SelectItem key={inq.id} value={inq.id}>
                                {inq.number} — {inq.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : inquiry ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">{t('inquiry')}</span>
                        <span className="text-xs">{inquiry.number} — {inquiry.title}</span>
                      </div>
                    ) : null}
                    {order && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">{t('order')}</span>
                        <span className="text-xs">{order.code}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Konditionen */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('terms')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <EditableField label={t('paymentTermDays')} value={doc.paymentTermDays} field="paymentTermDays" type="number" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label={t('discountPercent')} value={doc.discountPercent} field="discountPercent" type="number" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label={t('discountDays')} value={doc.discountDays} field="discountDays" type="number" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label={t('shippingCostNet')} value={doc.shippingCostNet} field="shippingCostNet" type="number" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label={t('deliveryType')} value={doc.deliveryType} field="deliveryType" editable={isDraft} onSave={handleSidebarField} />
                    <EditableField label={t('deliveryTerms')} value={doc.deliveryTerms} field="deliveryTerms" editable={isDraft} onSave={handleSidebarField} />
                  </CardContent>
                </Card>

                {/* Bemerkungen */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('remarks')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {isDraft ? (
                      <>
                        <div className="space-y-0.5">
                          <Label className="text-xs text-muted-foreground">{t('remarksLabel')}</Label>
                          <Textarea
                            className="text-xs min-h-[60px]"
                            defaultValue={doc.notes ?? ''}
                            placeholder={t('remarksPlaceholder')}
                            onBlur={(e) => handleSidebarField('notes', e.target.value.trim() || null)}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-xs text-muted-foreground">{t('internalNotesLabel')}</Label>
                          <Textarea
                            className="text-xs min-h-[60px]"
                            defaultValue={doc.internalNotes ?? ''}
                            placeholder={t('internalNotesPlaceholder2')}
                            onBlur={(e) => handleSidebarField('internalNotes', e.target.value.trim() || null)}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        {doc.notes ? (
                          <div>
                            <span className="text-muted-foreground text-xs">{t('remarksColon')}</span>
                            <p className="text-xs mt-0.5">{doc.notes}</p>
                          </div>
                        ) : null}
                        {doc.internalNotes ? (
                          <div>
                            <span className="text-muted-foreground text-xs">{t('internalLabel')}</span>
                            <p className="text-xs mt-0.5">{doc.internalNotes}</p>
                          </div>
                        ) : null}
                        {!doc.notes && !doc.internalNotes && (
                          <p className="text-muted-foreground text-xs">{t('noRemarks')}</p>
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
        eInvoiceEnabled={tenantConfig?.eInvoiceEnabled}
        eInvoiceMissingFields={eInvoiceMissingFields}
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
        title={t('cancelDialogTitle')}
        description={t('cancelDialogDescription', { number: doc.number })}
        onConfirm={handleCancel}
        confirmLabel={t('cancelDocument')}
        variant="destructive"
      />
      <EmailComposeDialog
        documentId={doc.id}
        documentType={doc.type}
        documentNumber={doc.number}
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
      />
      {isImmutable && <EmailSendLog documentId={doc.id} />}
    </div>
  )
}
