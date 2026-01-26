'use client'

import * as React from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from './button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './sheet'

interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Dialog title */
  title: string
  /** Dialog description */
  description: string
  /** Confirm button label */
  confirmLabel?: string
  /** Cancel button label */
  cancelLabel?: string
  /** Dialog variant */
  variant?: 'default' | 'destructive'
  /** Whether the confirm action is loading */
  isLoading?: boolean
  /** Callback when confirm is clicked */
  onConfirm: () => void | Promise<void>
}

/**
 * Confirmation dialog for destructive or important actions.
 * Uses Sheet with side="bottom" following the project pattern.
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Delete Employee"
 *   description="Are you sure you want to delete this employee?"
 *   variant="destructive"
 *   onConfirm={handleDelete}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm()
    // Don't close automatically - let the parent handle it
  }

  const handleCancel = () => {
    if (!isLoading) {
      onOpenChange(false)
    }
  }

  const isDestructive = variant === 'destructive'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-md sm:mx-auto sm:rounded-t-lg">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3">
            {isDestructive && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            )}
            <div>
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription className="mt-1">{description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <SheetFooter className="flex-row gap-2 sm:gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
