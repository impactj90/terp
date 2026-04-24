'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CameraCaptureButton } from '@/components/ui/camera-capture-button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUploadWhArticleImage } from '@/hooks'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

interface ArticleImageUploadProps {
  articleId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FileStatus = 'pending' | 'uploading' | 'complete' | 'error'

interface FileEntry {
  file: File
  status: FileStatus
  previewUrl: string
  error?: string
}

export function ArticleImageUpload({
  articleId,
  open,
  onOpenChange,
}: ArticleImageUploadProps) {
  const t = useTranslations('warehouseArticles')
  const tc = useTranslations('common')
  const { getUploadUrl, confirmUpload } = useUploadWhArticleImage()
  const [files, setFiles] = React.useState<FileEntry[]>([])
  const [isUploading, setIsUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const dropRef = React.useRef<HTMLDivElement>(null)

  // Cleanup preview URLs on unmount — empty deps intentional (only runs on unmount)
  const filesRef = React.useRef(files)
  filesRef.current = files
  React.useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    }
  }, [])

  const resetState = React.useCallback(() => {
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    setFiles([])
    setIsUploading(false)
  }, [files])

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetState()
      }
      onOpenChange(newOpen)
    },
    [onOpenChange, resetState]
  )

  const addFiles = React.useCallback(
    (newFiles: FileList | File[]) => {
      const entries: FileEntry[] = []
      for (const file of Array.from(newFiles)) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          entries.push({
            file,
            status: 'error',
            previewUrl: '',
            error: `Invalid type: ${file.type}`,
          })
          continue
        }
        if (file.size > MAX_SIZE) {
          entries.push({
            file,
            status: 'error',
            previewUrl: '',
            error: 'File too large (max 5 MB)',
          })
          continue
        }
        entries.push({
          file,
          status: 'pending',
          previewUrl: URL.createObjectURL(file),
        })
      }
      setFiles((prev) => [...prev, ...entries])
    },
    []
  )

  const removeFile = React.useCallback((index: number) => {
    setFiles((prev) => {
      const entry = prev[index]
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files)
      }
    },
    [addFiles]
  )

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleFileSelect = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files)
        e.target.value = '' // Reset input
      }
    },
    [addFiles]
  )

  const handleUpload = React.useCallback(async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending')
    if (pendingFiles.length === 0) return

    setIsUploading(true)
    let successCount = 0

    for (let i = 0; i < files.length; i++) {
      const entry = files[i]
      if (!entry || entry.status !== 'pending') continue

      // Update status to uploading
      setFiles((prev) =>
        prev.map((f, idx) =>
          idx === i ? { ...f, status: 'uploading' as FileStatus } : f
        )
      )

      try {
        // 1. Get signed upload URL
        const urlResult = await getUploadUrl.mutateAsync({
          articleId,
          filename: entry.file.name,
          mimeType: entry.file.type,
        })

        // 2. Upload directly to Supabase Storage
        const uploadResponse = await fetch(urlResult.signedUrl, {
          method: 'PUT',
          body: entry.file,
          headers: {
            'Content-Type': entry.file.type,
          },
        })

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`)
        }

        // 3. Confirm upload (creates DB record + thumbnail)
        await confirmUpload.mutateAsync({
          articleId,
          storagePath: urlResult.storagePath,
          filename: entry.file.name,
          mimeType: entry.file.type,
          sizeBytes: entry.file.size,
        })

        // Update status to complete
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'complete' as FileStatus } : f
          )
        )
        successCount++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: 'error' as FileStatus, error: message }
              : f
          )
        )
      }
    }

    setIsUploading(false)

    if (successCount > 0) {
      if (successCount === 1) {
        toast.success(t('toastImageUploaded'))
      } else {
        toast.success(t('toastImagesUploaded', { count: successCount }))
      }
      // Close dialog after a short delay
      setTimeout(() => handleOpenChange(false), 500)
    }
  }, [files, articleId, getUploadUrl, confirmUpload, t, handleOpenChange])

  const pendingCount = files.filter((f) => f.status === 'pending').length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('uploadDialogTitle')}</DialogTitle>
          <DialogDescription>{t('uploadDialogDescription')}</DialogDescription>
        </DialogHeader>

        {/* Mobile-only direct camera capture */}
        <CameraCaptureButton
          onChange={handleFileSelect}
          label={tc('takePhoto')}
          disabled={isUploading}
          className="w-full"
        />

        {/* Drop zone */}
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('uploadDropzoneText')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('uploadDropzoneHint')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {files.map((entry, index) => (
              <div
                key={`${entry.file.name}-${index}`}
                className="flex items-center gap-3 p-2 rounded-md border"
              >
                {/* Preview */}
                {entry.previewUrl ? (
                  <img
                    src={entry.previewUrl}
                    alt={entry.file.name}
                    className="h-10 w-10 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {entry.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(entry.file.size / 1024).toFixed(0)} KB
                  </p>
                  {entry.error && (
                    <p className="text-xs text-destructive">{entry.error}</p>
                  )}
                </div>

                {/* Status indicator */}
                <div className="flex-shrink-0">
                  {entry.status === 'uploading' && (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  {entry.status === 'complete' && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                  {entry.status === 'error' && (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  )}
                  {entry.status === 'pending' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFile(index)
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{tc('remove')}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {files.length > 0 && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isUploading || pendingCount === 0}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('uploadProgress')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('actionUploadImages')} ({pendingCount})
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
