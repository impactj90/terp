'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Flashlight, FlashlightOff, Keyboard, Camera } from 'lucide-react'

interface QrScannerProps {
  onScan: (code: string) => void
  onError?: (error: string) => void
  onManualInput?: (articleNumber: string) => void
  enabled?: boolean
  className?: string
}

/**
 * QR Scanner Component
 *
 * Uses html5-qrcode library for camera-based QR scanning.
 * Falls back to manual article number input when camera is not available.
 * Dynamically imports html5-qrcode to avoid SSR issues.
 */
export function QrScanner({
  onScan,
  onError,
  onManualInput,
  enabled = true,
  className,
}: QrScannerProps) {
  const t = useTranslations('warehouseScanner')
  const scannerRef = React.useRef<HTMLDivElement>(null)
  const html5QrCodeRef = React.useRef<unknown>(null)
  const lastScanRef = React.useRef<number>(0)
  const [showManualInput, setShowManualInput] = React.useState(false)
  const [manualValue, setManualValue] = React.useState('')
  const [cameraError, setCameraError] = React.useState<string | null>(null)
  const [torchOn, setTorchOn] = React.useState(false)
  const [torchSupported, setTorchSupported] = React.useState(false)
  const [scannerReady, setScannerReady] = React.useState(false)

  // Beep sound on successful scan
  const playBeep = React.useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      oscillator.frequency.value = 1200
      oscillator.type = 'sine'
      gainNode.gain.value = 0.3
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.15)
    } catch {
      // Audio not available, ignore
    }
  }, [])

  // Handle successful decode
  const handleDecode = React.useCallback(
    (decodedText: string) => {
      // Debounce: ignore scans within 500ms of last scan
      const now = Date.now()
      if (now - lastScanRef.current < 500) return
      lastScanRef.current = now

      // Validate TERP:ART: prefix
      if (decodedText.startsWith('TERP:ART:')) {
        // Vibration feedback
        navigator.vibrate?.(200)
        // Audio feedback
        playBeep()
        onScan(decodedText)
      } else {
        onError?.(t('invalidQrCode'))
      }
    },
    [onScan, onError, playBeep, t]
  )

  // Initialize scanner
  React.useEffect(() => {
    if (!enabled || showManualInput || !scannerRef.current) return

    let mounted = true
    let scanner: { stop: () => Promise<void>; applyVideoConstraints?: (constraints: Record<string, unknown>) => Promise<void> } | null = null
    let scannerStarted = false

    const initScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')

        if (!mounted || !scannerRef.current) return

        const scannerId = scannerRef.current.id || 'qr-scanner-region'
        scannerRef.current.id = scannerId

        const html5QrCode = new Html5Qrcode(scannerId)
        scanner = html5QrCode as unknown as typeof scanner
        html5QrCodeRef.current = html5QrCode

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText: string) => {
            if (mounted) handleDecode(decodedText)
          },
          () => {
            // Decode error -- expected during scanning, ignore
          }
        )

        if (mounted) {
          scannerStarted = true
          setScannerReady(true)
          setCameraError(null)

          // Check torch support
          try {
            const capabilities = html5QrCode.getRunningTrackCameraCapabilities?.()
            if (capabilities?.torchFeature?.().isSupported?.()) {
              setTorchSupported(true)
            }
          } catch {
            // Torch check failed, ignore
          }
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : String(err)
          setCameraError(message)
          setShowManualInput(true)
          onError?.(t('cameraPermissionDenied'))
        }
      }
    }

    initScanner()

    return () => {
      mounted = false
      setScannerReady(false)
      if (scanner && scannerStarted) {
        try {
          scanner.stop().catch(() => {
            // Ignore stop errors during cleanup
          })
        } catch {
          // Ignore synchronous stop errors (scanner not running)
        }
      }
      html5QrCodeRef.current = null
    }
  }, [enabled, showManualInput, handleDecode, onError, t])

  // Toggle torch
  const toggleTorch = React.useCallback(async () => {
    try {
      const html5QrCode = html5QrCodeRef.current as {
        getRunningTrackCameraCapabilities?: () => {
          torchFeature?: () => { apply: (value: boolean) => Promise<void> }
        }
      } | null
      const capabilities = html5QrCode?.getRunningTrackCameraCapabilities?.()
      const torch = capabilities?.torchFeature?.()
      if (torch) {
        await torch.apply(!torchOn)
        setTorchOn(!torchOn)
      }
    } catch {
      // Torch toggle failed, ignore
    }
  }, [torchOn])

  // Manual input submit
  const handleManualSubmit = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const value = manualValue.trim()
      if (!value) return

      // If it looks like a full QR code, resolve as QR
      if (value.startsWith('TERP:ART:')) {
        navigator.vibrate?.(200)
        playBeep()
        onScan(value)
      } else {
        // Plain article number -- use manual input callback
        navigator.vibrate?.(100)
        onManualInput?.(value)
      }
      setManualValue('')
    },
    [manualValue, onScan, onManualInput, playBeep]
  )

  return (
    <div className={className}>
      {!showManualInput ? (
        <>
          {/* Camera scanner area */}
          <div className="relative">
            <div
              ref={scannerRef}
              className="w-full overflow-hidden rounded-lg bg-black"
              style={{ minHeight: '300px' }}
            />

            {/* Overlay controls */}
            {scannerReady && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                {torchSupported && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full bg-black/60 text-white hover:bg-black/80"
                    onClick={toggleTorch}
                    title={torchOn ? t('torchOff') : t('torchOn')}
                  >
                    {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-12 w-12 rounded-full bg-black/60 text-white hover:bg-black/80"
                  onClick={() => setShowManualInput(true)}
                  title={t('manualInput')}
                >
                  <Keyboard className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Manual input fallback */
        <Card>
          <CardContent className="p-4">
            {cameraError && (
              <p className="mb-3 text-sm text-muted-foreground">
                {t('cameraPermissionDenied')}
              </p>
            )}
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <Input
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder={t('manualInputPlaceholder')}
                className="h-12 text-lg"
                autoFocus
              />
              <Button type="submit" size="lg" className="h-12 min-w-[48px]">
                OK
              </Button>
            </form>
            {!cameraError && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setShowManualInput(false)
                  setCameraError(null)
                }}
              >
                <Camera className="mr-2 h-4 w-4" />
                {t('scannerTitle')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
