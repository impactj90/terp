'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Paperclip, Trash2, Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useServiceObjectAttachments,
  useGetAttachmentUploadUrl,
  useConfirmAttachmentUpload,
  useDeleteAttachment,
  useGetAttachmentDownloadUrl,
} from '@/hooks/use-service-objects'

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

interface Props {
  serviceObjectId: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentList({ serviceObjectId }: Props) {
  const { data: attachments, isLoading } = useServiceObjectAttachments(
    serviceObjectId
  )
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const getUploadUrl = useGetAttachmentUploadUrl()
  const confirmUpload = useConfirmAttachmentUpload()
  const deleteAttachment = useDeleteAttachment()
  const getDownloadUrl = useGetAttachmentDownloadUrl()
  const [uploading, setUploading] = React.useState(false)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error(`Dateityp nicht erlaubt: ${file.type || 'unbekannt'}`)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Datei überschreitet 10 MB')
      return
    }

    setUploading(true)
    try {
      const uploadMeta = await getUploadUrl.mutateAsync({
        serviceObjectId,
        filename: file.name,
        mimeType: file.type,
      })
      if (!uploadMeta) throw new Error('Upload-URL konnte nicht erstellt werden')
      const putRes = await fetch(uploadMeta.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putRes.ok) {
        throw new Error(`Upload fehlgeschlagen: ${putRes.status}`)
      }
      await confirmUpload.mutateAsync({
        serviceObjectId,
        storagePath: uploadMeta.storagePath,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })
      toast.success('Anhang hochgeladen')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDownload(attachmentId: string) {
    try {
      const res = await getDownloadUrl.mutateAsync({ attachmentId })
      if (res?.signedUrl) {
        window.open(res.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download fehlgeschlagen')
    }
  }

  async function handleDelete(attachmentId: string) {
    try {
      await deleteAttachment.mutateAsync({ attachmentId })
      toast.success('Anhang gelöscht')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Anhänge</CardTitle>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelected}
            accept={ALLOWED_MIME_TYPES.join(',')}
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? 'Lade hoch…' : 'Hochladen'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
        {attachments && attachments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Noch keine Anhänge. Erlaubt: PDF, Bilder, DOCX, XLSX (bis 10 MB).
          </p>
        )}
        <ul className="divide-y">
          {(attachments ?? []).map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(a.sizeBytes)} · {a.mimeType}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownload(a.id)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(a.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
