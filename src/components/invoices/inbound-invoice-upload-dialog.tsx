'use client'

import * as React from 'react'
import { Upload, Loader2, FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCreateFromUpload } from '@/hooks/useInboundInvoices'

const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InboundInvoiceUploadDialog({ open, onOpenChange }: Props) {
  const t = useTranslations('inboundInvoices')
  const router = useRouter()
  const createFromUpload = useCreateFromUpload()
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
    [onOpenChange, reset]
  )

  const processFile = React.useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error(t('upload.onlyPdf'))
      return
    }
    if (file.size > MAX_SIZE) {
      toast.error(t('upload.fileTooLarge'))
      return
    }

    setSelectedFile(file)
    setIsUploading(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )

      const result = await createFromUpload.mutateAsync({
        fileBase64: base64,
        filename: file.name,
      })

      toast.success(t('upload.success'))
      handleOpenChange(false)
      router.push(`/invoices/inbound/${result.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('upload.error')
      toast.error(msg)
      setIsUploading(false)
    }
  }, [createFromUpload, handleOpenChange, router, t])

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('upload.title')}</DialogTitle>
        </DialogHeader>

        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {selectedFile?.name ?? t('upload.uploading')}
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
                {t('upload.dropHint')}
              </p>
              <p className="text-xs text-muted-foreground">{t('upload.maxSize')}</p>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) processFile(file)
            }}
          />
        </div>

        {!isUploading && !selectedFile && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            {t('upload.selectButton')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
