'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Upload, X, CheckCircle, AlertCircle, Loader2, FileText, FileSpreadsheet, Image, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CameraCaptureButton } from '@/components/ui/camera-capture-button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { useUploadCrmCorrespondenceAttachment } from '@/hooks'

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_ATTACHMENTS = 5

interface CorrespondenceAttachmentUploadProps {
  correspondenceId: string
  disabled?: boolean
  currentCount: number
}

type FileStatus = 'pending' | 'uploading' | 'complete' | 'error'

interface FileEntry {
  file: File
  status: FileStatus
  error?: string
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') {
    return <FileText className="h-5 w-5 text-red-600 flex-shrink-0" />
  }
  if (mimeType.startsWith('image/')) {
    return <Image className="h-5 w-5 text-blue-600 flex-shrink-0" />
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return <FileSpreadsheet className="h-5 w-5 text-green-600 flex-shrink-0" />
  }
  return <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
}

export function CorrespondenceAttachmentUpload({
  correspondenceId,
  disabled = false,
  currentCount,
}: CorrespondenceAttachmentUploadProps) {
  const t = useTranslations('crmCorrespondence')
  const tc = useTranslations('common')
  const { getUploadUrl, confirmUpload } = useUploadCrmCorrespondenceAttachment()
  const [files, setFiles] = React.useState<FileEntry[]>([])
  const [isUploading, setIsUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const canAddMore = currentCount < MAX_ATTACHMENTS

  const addFiles = React.useCallback(
    (newFiles: FileList | globalThis.File[]) => {
      const entries: FileEntry[] = []
      let remaining = MAX_ATTACHMENTS - currentCount

      for (const file of Array.from(newFiles)) {
        if (remaining <= 0) {
          entries.push({
            file,
            status: 'error',
            error: t('errorMaxAttachments'),
          })
          continue
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
          entries.push({
            file,
            status: 'error',
            error: t('errorInvalidType'),
          })
          continue
        }
        if (file.size > MAX_SIZE) {
          entries.push({
            file,
            status: 'error',
            error: t('errorFileTooLarge'),
          })
          continue
        }
        entries.push({
          file,
          status: 'pending',
        })
        remaining--
      }
      setFiles((prev) => [...prev, ...entries])
    },
    [currentCount, t]
  )

  const removeFile = React.useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
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
          correspondenceId,
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

        // 3. Confirm upload (creates DB record)
        await confirmUpload.mutateAsync({
          correspondenceId,
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
      toast.success(t('toastAttachmentUploaded'))
      // Clear completed files after a short delay
      setTimeout(() => {
        setFiles((prev) => prev.filter((f) => f.status !== 'complete'))
      }, 1000)
    }
  }, [files, correspondenceId, getUploadUrl, confirmUpload, t])

  const pendingCount = files.filter((f) => f.status === 'pending').length

  if (!canAddMore && files.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('attachmentCount', { count: currentCount, max: MAX_ATTACHMENTS })}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Mobile-only direct camera capture */}
      {canAddMore && (
        <CameraCaptureButton
          onChange={handleFileSelect}
          label={tc('takePhoto')}
          disabled={isUploading || disabled}
          className="w-full"
        />
      )}

      {/* Drop zone */}
      {canAddMore && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-1 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors"
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('uploadDropzoneText')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('uploadDropzoneHint')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('attachmentCount', { count: currentCount, max: MAX_ATTACHMENTS })}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,.docx,.xlsx"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            disabled={disabled}
          />
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((entry, index) => (
            <div
              key={`${entry.file.name}-${index}`}
              className="flex items-center gap-3 p-2 rounded-md border"
            >
              {getFileIcon(entry.file.type)}

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

          {/* Upload button */}
          {pendingCount > 0 && (
            <Button
              onClick={handleUpload}
              disabled={isUploading || disabled}
              size="sm"
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('uploadProgress')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('uploadAttachment')} ({pendingCount})
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
