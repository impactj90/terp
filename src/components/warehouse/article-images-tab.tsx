'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Star, Trash2, Upload, GripVertical, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useWhArticleImages,
  useSetPrimaryWhArticleImage,
  useReorderWhArticleImages,
  useDeleteWhArticleImage,
} from '@/hooks'
import { ArticleImageUpload } from './article-image-upload'

interface ArticleImagesTabProps {
  articleId: string
}

// Type for image with signed URLs
interface ArticleImageWithUrls {
  id: string
  articleId: string
  tenantId: string
  filename: string
  storagePath: string
  thumbnailPath: string | null
  mimeType: string
  sizeBytes: number
  sortOrder: number
  isPrimary: boolean
  createdAt: Date | string
  createdById: string | null
  url: string | null
  thumbnailUrl: string | null
}

function SortableImageCard({
  image,
  onSetPrimary,
  onDelete,
  onClickImage,
}: {
  image: ArticleImageWithUrls
  onSetPrimary: (id: string) => void
  onDelete: (id: string) => void
  onClickImage: (image: ArticleImageWithUrls) => void
}) {
  const t = useTranslations('warehouseArticles')
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative bg-card border rounded-lg overflow-hidden"
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing rounded bg-background/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Primary badge */}
      {image.isPrimary && (
        <Badge
          variant="default"
          className="absolute top-2 right-2 z-10 gap-1"
        >
          <Star className="h-3 w-3 fill-current" />
          {t('badgePrimaryImage')}
        </Badge>
      )}

      {/* Image */}
      <div
        className="aspect-square cursor-pointer"
        onClick={() => onClickImage(image)}
      >
        {image.thumbnailUrl ? (
          <img
            src={image.thumbnailUrl}
            alt={image.filename}
            className="w-full h-full object-cover"
          />
        ) : image.url ? (
          <img
            src={image.url}
            alt={image.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Hover overlay with actions */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1">
        {!image.isPrimary && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetPrimary(image.id)
                }}
              >
                <Star className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actionSetPrimary')}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(image.id)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('actionDeleteImage')}</TooltipContent>
        </Tooltip>
      </div>

      {/* Filename */}
      <div className="p-2 text-xs text-muted-foreground truncate">
        {image.filename}
      </div>
    </div>
  )
}

export function ArticleImagesTab({ articleId }: ArticleImagesTabProps) {
  const t = useTranslations('warehouseArticles')
  const { data: images, isLoading } = useWhArticleImages(articleId)
  const setPrimary = useSetPrimaryWhArticleImage()
  const reorder = useReorderWhArticleImages()
  const deleteImage = useDeleteWhArticleImage()

  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [lightboxImage, setLightboxImage] = React.useState<ArticleImageWithUrls | null>(null)
  const [deleteImageId, setDeleteImageId] = React.useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id || !images) return

      const oldIndex = images.findIndex((img) => img.id === active.id)
      const newIndex = images.findIndex((img) => img.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(images, oldIndex, newIndex)
      reorder.mutate(
        { imageIds: reordered.map((img) => img.id) },
        {
          onSuccess: () => toast.success(t('toastReordered')),
        }
      )
    },
    [images, reorder, t]
  )

  const handleSetPrimary = React.useCallback(
    (imageId: string) => {
      setPrimary.mutate(
        { imageId },
        {
          onSuccess: () => toast.success(t('toastPrimarySet')),
        }
      )
    },
    [setPrimary, t]
  )

  const handleDeleteConfirm = React.useCallback(() => {
    if (!deleteImageId) return
    deleteImage.mutate(
      { imageId: deleteImageId },
      {
        onSuccess: () => {
          toast.success(t('toastImageDeleted'))
          setDeleteImageId(null)
        },
      }
    )
  }, [deleteImageId, deleteImage, t])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const imageList = (images ?? []) as ArticleImageWithUrls[]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('imagesHeading')}</h3>
        <Button onClick={() => setUploadOpen(true)} size="sm">
          <Upload className="h-4 w-4 mr-2" />
          {t('actionUploadImage')}
        </Button>
      </div>

      {/* Empty state */}
      {imageList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
          <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">{t('noImages')}</p>
          <Button onClick={() => setUploadOpen(true)} variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            {t('actionUploadImage')}
          </Button>
        </div>
      ) : (
        /* Image grid */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={imageList.map((img) => img.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {imageList.map((image) => (
                <SortableImageCard
                  key={image.id}
                  image={image}
                  onSetPrimary={handleSetPrimary}
                  onDelete={setDeleteImageId}
                  onClickImage={setLightboxImage}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Upload dialog */}
      <ArticleImageUpload
        articleId={articleId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />

      {/* Lightbox */}
      <Dialog
        open={!!lightboxImage}
        onOpenChange={(open) => {
          if (!open) setLightboxImage(null)
        }}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {lightboxImage?.url && (
            <img
              src={lightboxImage.url}
              alt={lightboxImage.filename}
              className="w-full h-auto max-h-[80vh] object-contain"
            />
          )}
          <DialogClose className="absolute top-2 right-2" />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteImageId}
        onOpenChange={(open) => {
          if (!open) setDeleteImageId(null)
        }}
        title={t('confirmDeleteImageTitle')}
        description={t('confirmDeleteImageDescription')}
        onConfirm={handleDeleteConfirm}
        variant="destructive"
        isLoading={deleteImage.isPending}
      />
    </div>
  )
}
