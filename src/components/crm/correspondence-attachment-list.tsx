'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { FileText, FileSpreadsheet, Image, File, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useCrmCorrespondenceAttachments, useDeleteCrmCorrespondenceAttachment } from '@/hooks'

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface CorrespondenceAttachmentListProps {
  correspondenceId: string
  readOnly?: boolean
}

export function CorrespondenceAttachmentList({
  correspondenceId,
  readOnly = false,
}: CorrespondenceAttachmentListProps) {
  const t = useTranslations('crmCorrespondence')
  const { data: attachments, isLoading } = useCrmCorrespondenceAttachments(correspondenceId)
  const deleteMutation = useDeleteCrmCorrespondenceAttachment()
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; filename: string } | null>(null)

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id })
      toast.success(t('toastAttachmentDeleted'))
      setDeleteTarget(null)
    } catch {
      // Error handled by mutation
    }
  }

  const handleDownload = (downloadUrl: string | null, filename: string) => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.click()
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (!attachments || attachments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('noAttachments')}</p>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center gap-3 p-2 rounded-md border"
          >
            {getFileIcon(attachment.mimeType)}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{attachment.filename}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(attachment.sizeBytes)}
              </p>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(attachment.downloadUrl, attachment.filename)}
                    disabled={!attachment.downloadUrl}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('downloadAttachment')}</TooltipContent>
              </Tooltip>

              {!readOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget({ id: attachment.id, filename: attachment.filename })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('deleteAttachment')}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('deleteAttachment')}
        description={t('deleteAttachmentDescription', { name: deleteTarget?.filename ?? '' })}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onConfirm={handleDelete}
        variant="destructive"
        isLoading={deleteMutation.isPending}
      />
    </>
  )
}
