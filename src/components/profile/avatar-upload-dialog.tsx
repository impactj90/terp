'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Upload, Loader2, Trash2 } from 'lucide-react'
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
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useTRPC } from '@/trpc'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/auth-provider'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB

interface AvatarUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentAvatarUrl: string | null
  initials: string
}

export function AvatarUploadDialog({
  open,
  onOpenChange,
  currentAvatarUrl,
  initials,
}: AvatarUploadDialogProps) {
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { refetch } = useAuth()
  const [preview, setPreview] = React.useState<string | null>(null)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const getUploadUrl = useMutation(trpc.users.avatarGetUploadUrl.mutationOptions())
  const confirmUpload = useMutation(trpc.users.avatarConfirmUpload.mutationOptions())
  const deleteAvatar = useMutation(trpc.users.avatarDelete.mutationOptions())

  const resetState = React.useCallback(() => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setSelectedFile(null)
    setIsUploading(false)
  }, [preview])

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (!newOpen) resetState()
      onOpenChange(newOpen)
    },
    [onOpenChange, resetState]
  )

  const handleFileSelect = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`Invalid file type: ${file.type}`)
        return
      }
      if (file.size > MAX_SIZE) {
        toast.error('File too large (max 2 MB)')
        return
      }

      if (preview) URL.revokeObjectURL(preview)
      setSelectedFile(file)
      setPreview(URL.createObjectURL(file))
    },
    [preview]
  )

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (!file) return

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`Invalid file type: ${file.type}`)
        return
      }
      if (file.size > MAX_SIZE) {
        toast.error('File too large (max 2 MB)')
        return
      }

      if (preview) URL.revokeObjectURL(preview)
      setSelectedFile(file)
      setPreview(URL.createObjectURL(file))
    },
    [preview]
  )

  const handleUpload = React.useCallback(async () => {
    if (!selectedFile) return
    setIsUploading(true)

    try {
      // 1. Get signed upload URL
      const { signedUrl, path } = await getUploadUrl.mutateAsync({
        mimeType: selectedFile.type,
      })

      // 2. Upload directly to Supabase Storage
      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: { 'Content-Type': selectedFile.type },
      })
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`)
      }

      // 3. Confirm upload
      await confirmUpload.mutateAsync({
        storagePath: path,
        mimeType: selectedFile.type,
        sizeBytes: selectedFile.size,
      })

      // 4. Refresh auth context so avatar updates everywhere
      await refetch()
      queryClient.invalidateQueries({ queryKey: trpc.auth.me.queryKey() })

      toast.success(t('avatarUploadSuccess'))
      handleOpenChange(false)
    } catch {
      // Error toast is handled by global mutation error handler
    } finally {
      setIsUploading(false)
    }
  }, [selectedFile, getUploadUrl, confirmUpload, refetch, queryClient, trpc, t, handleOpenChange])

  const handleRemove = React.useCallback(async () => {
    setIsUploading(true)
    try {
      await deleteAvatar.mutateAsync()
      await refetch()
      queryClient.invalidateQueries({ queryKey: trpc.auth.me.queryKey() })
      toast.success(t('avatarRemoveSuccess'))
      handleOpenChange(false)
    } catch {
      // Error toast handled globally
    } finally {
      setIsUploading(false)
    }
  }, [deleteAvatar, refetch, queryClient, trpc, t, handleOpenChange])

  const displayUrl = preview ?? currentAvatarUrl

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('avatarDialogTitle')}</DialogTitle>
          <DialogDescription>{t('avatarDialogDescription')}</DialogDescription>
        </DialogHeader>

        {/* Preview */}
        <div className="flex justify-center">
          <Avatar className="h-32 w-32 text-4xl">
            <AvatarImage src={displayUrl ?? undefined} alt="Avatar" />
            <AvatarFallback className="text-4xl font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Mobile-only direct camera capture */}
        <CameraCaptureButton
          onChange={handleFileSelect}
          label={tc('takePhoto')}
          disabled={isUploading}
          className="w-full"
        />

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors hover:border-primary hover:bg-accent/50"
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('avatarDropzoneText')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('avatarDropzoneHint')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <div>
            {currentAvatarUrl && !preview && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={isUploading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('removeAvatar')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            {selectedFile && (
              <Button onClick={handleUpload} disabled={isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('avatarUploading')}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {t('uploadAvatar')}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
