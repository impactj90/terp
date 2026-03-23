'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useBulkImportBillingPriceListEntries } from '@/hooks'
import { useTRPC } from '@/trpc'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

interface ParsedLine {
  raw: string
  key: string
  description: string
  unitPrice: number
  minQuantity?: number
  unit?: string
}

interface ResolvedEntry {
  articleId?: string
  itemKey?: string
  description?: string
  unitPrice: number
  minQuantity?: number
  unit?: string
  displayName: string
  isArticle: boolean
}

function parseCsvInput(text: string, t: (key: string, values?: Record<string, unknown>) => string): { lines: ParsedLine[]; errors: string[] } {
  const rawLines = text.trim().split('\n').filter(l => l.trim().length > 0)
  const lines: ParsedLine[] = []
  const errors: string[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!
    const parts = line.includes(';') ? line.split(';') : line.split('\t')
    if (parts.length < 3) {
      errors.push(t('bulkImportMinFields', { line: String(i + 1) }))
      continue
    }

    const priceStr = parts[2] ?? ''
    const unitPrice = parseFloat(priceStr.trim().replace(',', '.'))
    if (isNaN(unitPrice)) {
      errors.push(t('bulkImportInvalidPrice', { line: String(i + 1), value: priceStr.trim() }))
      continue
    }

    const minQtyStr = parts[3]?.trim()
    const minQty = minQtyStr ? parseFloat(minQtyStr.replace(',', '.')) : undefined
    if (minQtyStr && minQty !== undefined && isNaN(minQty)) {
      errors.push(t('bulkImportInvalidQuantity', { line: String(i + 1), value: minQtyStr }))
      continue
    }

    lines.push({
      raw: line,
      key: (parts[0] ?? '').trim(),
      description: (parts[1] ?? '').trim(),
      unitPrice,
      minQuantity: minQty,
      unit: parts[4]?.trim() || undefined,
    })
  }

  return { lines, errors }
}

interface PriceListBulkImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  priceListId: string
}

export function PriceListBulkImportDialog({
  open,
  onOpenChange,
  priceListId,
}: PriceListBulkImportDialogProps) {
  const t = useTranslations('billingPriceListEntries')
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [csvText, setCsvText] = React.useState('')
  const [resolvedEntries, setResolvedEntries] = React.useState<ResolvedEntry[] | null>(null)
  const [parseErrors, setParseErrors] = React.useState<string[]>([])
  const [isResolving, setIsResolving] = React.useState(false)
  const importMutation = useBulkImportBillingPriceListEntries()

  React.useEffect(() => {
    if (open) {
      setCsvText('')
      setResolvedEntries(null)
      setParseErrors([])
    }
  }, [open])

  const handleParse = async () => {
    const { lines, errors } = parseCsvInput(csvText, (key, values) => t(key as Parameters<typeof t>[0], values as never))
    setParseErrors(errors)

    if (lines.length === 0) {
      setResolvedEntries(null)
      return
    }

    setIsResolving(true)
    try {
      const keys = [...new Set(lines.map(l => l.key).filter(Boolean))]

      const articleMap = new Map<string, { id: string; number: string; name: string; unit: string }>()
      if (keys.length > 0) {
        const results = await queryClient.fetchQuery(
          trpc.warehouse.articles.search.queryOptions({ query: keys.join(' ') })
        )
        if (results) {
          for (const a of results as Array<{ id: string; number: string; name: string; unit: string }>) {
            articleMap.set(a.number.toLowerCase(), a)
          }
        }
      }

      const resolved: ResolvedEntry[] = lines.map((line) => {
        const matchedArticle = articleMap.get(line.key.toLowerCase())
        if (matchedArticle) {
          return {
            articleId: matchedArticle.id,
            description: line.description || undefined,
            unitPrice: line.unitPrice,
            minQuantity: line.minQuantity,
            unit: line.unit || matchedArticle.unit,
            displayName: `${matchedArticle.number} — ${matchedArticle.name}`,
            isArticle: true,
          }
        }
        return {
          itemKey: line.key || undefined,
          description: line.description || undefined,
          unitPrice: line.unitPrice,
          minQuantity: line.minQuantity,
          unit: line.unit,
          displayName: line.key || line.description || '–',
          isArticle: false,
        }
      })

      setResolvedEntries(resolved)
    } catch {
      const resolved: ResolvedEntry[] = lines.map((line) => ({
        itemKey: line.key || undefined,
        description: line.description || undefined,
        unitPrice: line.unitPrice,
        minQuantity: line.minQuantity,
        unit: line.unit,
        displayName: line.key || line.description || '–',
        isArticle: false,
      }))
      setResolvedEntries(resolved)
    } finally {
      setIsResolving(false)
    }
  }

  const handleImport = async () => {
    if (!resolvedEntries || resolvedEntries.length === 0) return

    try {
      const result = await importMutation.mutateAsync({
        priceListId,
        entries: resolvedEntries.map(e => ({
          ...(e.articleId ? { articleId: e.articleId } : {}),
          ...(e.itemKey ? { itemKey: e.itemKey } : {}),
          ...(e.description ? { description: e.description } : {}),
          unitPrice: e.unitPrice,
          ...(e.minQuantity != null ? { minQuantity: e.minQuantity } : {}),
          ...(e.unit ? { unit: e.unit } : {}),
        })),
      })
      toast.success(t('bulkImportSuccess', { created: String(result.created), updated: String(result.updated) }))
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message || t('bulkImportError'))
    }
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{t('bulkImportTitle')}</DialogTitle>
          <DialogDescription>
            {t('bulkImportDescription')}
            <br />
            <span className="font-mono text-xs">{t('bulkImportFormat')}</span>
            <br />
            {t('bulkImportHint')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-csv">{t('bulkImportData')}</Label>
            <Textarea
              id="bulk-csv"
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setResolvedEntries(null); setParseErrors([]) }}
              rows={6}
              placeholder={t('bulkImportPlaceholder')}
              className="font-mono text-sm"
            />
          </div>

          {parseErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-1">
                  {parseErrors.map((err, i) => (
                    <li key={i} className="text-sm">{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {resolvedEntries && resolvedEntries.length > 0 && (
            <div className="border rounded-md max-h-48 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('bulkImportType')}</TableHead>
                    <TableHead>{t('articleOrKey')}</TableHead>
                    <TableHead className="text-right">{t('unitPrice')}</TableHead>
                    <TableHead>{t('unit')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedEntries.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant={e.isArticle ? 'default' : 'secondary'} className="text-xs">
                          {e.isArticle ? t('bulkImportTypeArticle') : t('bulkImportTypeFree')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{e.displayName}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(e.unitPrice)}</TableCell>
                      <TableCell className="text-sm">{e.unit || '–'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          {!resolvedEntries ? (
            <Button onClick={handleParse} disabled={!csvText.trim() || isResolving}>
              {isResolving ? t('bulkImportResolving') : t('bulkImportPreview')}
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending || resolvedEntries.length === 0}
            >
              {importMutation.isPending ? t('bulkImportImporting') : t('bulkImportSubmit', { count: String(resolvedEntries.length) })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
