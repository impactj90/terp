'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import {
  useDsgvoPreview,
  useExecuteDsgvoRetention,
} from '@/hooks'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

interface RetentionPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RetentionPreviewDialog({
  open,
  onOpenChange,
}: RetentionPreviewDialogProps) {
  const t = useTranslations('dsgvo')
  const { data: preview, isLoading: previewLoading } = useDsgvoPreview()
  const executeMutation = useExecuteDsgvoRetention()

  const [step, setStep] = React.useState(1)
  const [confirmed, setConfirmed] = React.useState(false)
  const [confirmText, setConfirmText] = React.useState('')
  const [results, setResults] = React.useState<
    Array<{
      dataType: string
      action: string
      recordCount: number
      dryRun: boolean
      error?: string
    }>
  >([])

  const confirmWord = t('preview.confirmInput')
  const isConfirmValid = confirmText === confirmWord

  const totalAffected = preview?.reduce((sum, p) => sum + p.count, 0) ?? 0

  function handleClose() {
    setStep(1)
    setConfirmed(false)
    setConfirmText('')
    setResults([])
    onOpenChange(false)
  }

  async function handleExecute() {
    try {
      const result = await executeMutation.mutateAsync({ dryRun: false })
      setResults(result)
      setStep(4)
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 4 ? t('preview.success') : t('preview.title')}
          </DialogTitle>
          <DialogDescription>
            {step === 4
              ? t('preview.successDescription', {
                  count: results.reduce((s, r) => s + r.recordCount, 0),
                })
              : t('preview.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Summary */}
        {step === 1 && (
          <div className="space-y-4">
            {previewLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : totalAffected === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                {t('preview.noRecords')}
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('rules.dataType')}</TableHead>
                      <TableHead>{t('rules.action')}</TableHead>
                      <TableHead className="text-right">
                        {t('rules.affectedRecords')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview
                      ?.filter((p) => p.count > 0)
                      .map((p) => (
                        <TableRow key={p.dataType}>
                          <TableCell>
                            {t(
                              `dataTypes.${p.dataType}` as Parameters<typeof t>[0]
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                p.action === 'DELETE'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                            >
                              {t(
                                `actions.${p.action}` as Parameters<typeof t>[0]
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {p.count.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('preview.dryRun')}
              </Button>
              {totalAffected > 0 && (
                <Button variant="destructive" onClick={() => setStep(2)}>
                  {t('preview.execute')}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Confirmation checkbox */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950 p-4">
              <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
              <p className="text-sm">{t('preview.confirmDescription')}</p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="dsgvo-confirm"
                checked={confirmed}
                onCheckedChange={(val) => setConfirmed(val === true)}
              />
              <label
                htmlFor="dsgvo-confirm"
                className="text-sm font-medium leading-none"
              >
                {t('preview.step2Checkbox')}
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                {t('preview.step1Title')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setStep(3)}
                disabled={!confirmed}
              >
                {t('preview.step3Title')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Type confirmation word */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('preview.confirmDescription')}
            </p>

            <Input
              placeholder={t('preview.confirmPlaceholder')}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
            />

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)}>
                {t('preview.step2Title')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleExecute}
                disabled={!isConfirmValid || executeMutation.isPending}
              >
                {executeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('preview.executing')}
                  </>
                ) : (
                  t('preview.execute')
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">{t('preview.success')}</span>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('rules.dataType')}</TableHead>
                    <TableHead>{t('rules.action')}</TableHead>
                    <TableHead className="text-right">
                      {t('logs.recordCount')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results
                    .filter((r) => r.recordCount > 0)
                    .map((r) => (
                      <TableRow key={r.dataType}>
                        <TableCell>
                          {t(
                            `dataTypes.${r.dataType}` as Parameters<typeof t>[0]
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.action === 'DELETE'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {t(
                              `actions.${r.action}` as Parameters<typeof t>[0]
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {r.recordCount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>OK</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
