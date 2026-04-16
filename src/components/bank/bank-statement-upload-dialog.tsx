'use client'

import * as React from 'react'
import { Upload, Loader2, FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  useImportBankStatement,
  useAutoMatchStatement,
  useMatchProgress,
} from '@/hooks/useBankStatements'

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

function MatchProgressToast({ statementId, total, label }: { statementId: string; total: number; label: string }) {
  const { data } = useMatchProgress(statementId)
  const matched = data?.matched ?? 0
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0

  return (
    <div className="w-full space-y-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span>{matched}/{total}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BankStatementUploadDialog({ open, onOpenChange }: Props) {
  const t = useTranslations('bankInbox')
  const importMutation = useImportBankStatement()
  const autoMatchMutation = useAutoMatchStatement()
  const [isDragOver, setIsDragOver] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const reset = React.useCallback(() => {
    setSelectedFile(null)
    setIsUploading(false)
    setIsDragOver(false)
  }, [])

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (!newOpen) reset()
      onOpenChange(newOpen)
    },
    [onOpenChange, reset],
  )

  const processFile = React.useCallback(
    async (file: File) => {
      if (file.size > MAX_SIZE) {
        toast.error(t('upload.invalidFileToast'))
        return
      }

      setSelectedFile(file)
      setIsUploading(true)

      try {
        const arrayBuffer = await file.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            '',
          ),
        )

        const result = await importMutation.mutateAsync({
          fileBase64: base64,
          fileName: file.name,
        })

        if (result?.alreadyImported) {
          toast.info(t('upload.alreadyImportedToast'))
          handleOpenChange(false)
          return
        }

        handleOpenChange(false)
        const count = result?.transactionsImported ?? 0
        toast.success(t('upload.successToast', { count }))

        if (result?.statementId && count > 0) {
          const toastId = `match-${result.statementId}`
          toast(
            <MatchProgressToast
              statementId={result.statementId}
              total={count}
              label={t('upload.matchingProgress')}
            />,
            { id: toastId, duration: Infinity },
          )
          autoMatchMutation.mutate(
            { statementId: result.statementId },
            {
              onSuccess: (matchResult) => {
                toast.success(
                  t('upload.matchingDone', {
                    matched: matchResult?.autoMatched ?? 0,
                    total: count,
                  }),
                  { id: toastId },
                )
              },
              onError: () => {
                toast.error(t('upload.matchingError'), { id: toastId })
              },
            },
          )
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : t('upload.invalidFileToast')
        toast.error(msg)
        setIsUploading(false)
      }
    },
    [importMutation, autoMatchMutation, handleOpenChange, t],
  )

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('upload.dialogTitle')}</DialogTitle>
        </DialogHeader>

        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {selectedFile?.name ?? ''}
              </p>
            </div>
          ) : selectedFile ? (
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm">{selectedFile.name}</p>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                {t('upload.fileLabel')}
              </p>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/xml,text/xml,.xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) processFile(file)
            }}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isUploading}
          >
            {t('upload.cancel')}
          </Button>
          <Button
            variant="default"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {t('upload.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
