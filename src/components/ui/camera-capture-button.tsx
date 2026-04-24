'use client'

import * as React from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsTouchDevice } from '@/hooks/use-media-query'

export type CameraCaptureButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'onClick' | 'onChange' | 'type' | 'children'
> & {
  /**
   * Fires when the user has selected/captured a file via the native camera app.
   * Receives the raw ChangeEvent so existing `handleFileSelect(e)` handlers
   * can be passed directly. Async handlers are allowed — the return value is
   * discarded, matching the semantics of React's native onChange prop.
   */
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>
  /**
   * Translated button label (caller-provided — this component is label-agnostic).
   */
  label: string
  /**
   * Optional stable test id. Applied to the button; the hidden input gets
   * `${dataTestId}-input`.
   */
  dataTestId?: string
}

/**
 * Mobile-only direct camera capture button.
 *
 * Renders a `<Button>` + hidden `<input type="file" accept="image/*"
 * capture="environment">` that, on tap, opens the device's native
 * rear-camera app. Returns null on non-touch devices (desktops), since
 * the `capture` attribute is a no-op there and the label would be
 * misleading.
 *
 * Plug this in alongside an existing "Hochladen" button — pass the same
 * onChange handler so the captured photo flows through the component's
 * existing validation + upload pipeline.
 */
export function CameraCaptureButton({
  onChange,
  label,
  disabled,
  variant = 'outline',
  size = 'sm',
  className,
  dataTestId,
  ...buttonProps
}: CameraCaptureButtonProps) {
  const isTouch = useIsTouchDevice()
  const inputRef = React.useRef<HTMLInputElement>(null)

  if (!isTouch) return null

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
        disabled={disabled}
        data-testid={dataTestId ? `${dataTestId}-input` : undefined}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        data-testid={dataTestId}
        {...buttonProps}
      >
        <Camera className="mr-2 h-4 w-4" />
        {label}
      </Button>
    </>
  )
}
