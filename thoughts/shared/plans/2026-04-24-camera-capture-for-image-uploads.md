# Camera Capture für Bild-Uploads – Implementation Plan

## Overview

Fügt an allen sechs bildfähigen Upload-Oberflächen eine direkte Kamera-Aufnahme-Option via HTML5 `capture="environment"` hinzu. Monteure, Vertriebsmitarbeiter und andere mobile Nutzer können vor Ort direkt mit der Gerätekamera fotografieren und hochladen, ohne den Umweg über die OS-Foto-Mediathek. Auf Desktop-Geräten bleibt das UI unverändert.

## Current State Analysis

Die Codebasis hat sechs `<input type="file">`-Oberflächen, die Bilder akzeptieren — **keine** davon verwendet das `capture`-Attribut. Auf Mobilgeräten zeigt das OS den generischen Datei-Picker mit Kamera als einer von mehreren Optionen (Details: `thoughts/shared/research/2026-04-24-camera-upload-integration.md`).

Bestehende wiederverwendbare Patterns, auf die wir aufbauen:
- `src/hooks/use-media-query.ts:6-22` — `useMediaQuery(query: string): boolean`, SSR-safe (Initial-State `false`)
- `src/components/ui/button.tsx` — shadcn-style Button mit `cva`-Varianten, `data-slot`, `cn()`
- `src/components/ui/confirm-dialog.tsx` — etabliertes Pattern: Shared UI-Komponenten sind label-agnostisch (Caller übergibt übersetzten String)
- `messages/de.json`/`messages/en.json` mit `common`-Namespace (bereits enthält `upload: "Hochladen"`)
- `package.json:97` — `lucide-react@^0.563.0` bereits installiert (für `Camera`-Icon)
- `package.json:92` — `html5-qrcode@^2.3.8` existiert im Warehouse-QR-Scanner; beweist, dass HTTPS + Camera-APIs im Deployment funktionieren

## Desired End State

Nach Abschluss:

1. Auf Touch-Geräten (Smartphones, Tablets) erscheint neben jedem bestehenden "Hochladen"/Drop-Zone-Element ein zusätzlicher **„Foto aufnehmen"**-Button mit Kamera-Icon. Ein Tap öffnet die native Kamera-App des Geräts (Android/iOS) im Rückkamera-Modus. Nach der Aufnahme wird das Foto durch exakt denselben `onChange`-Handler wie der bisherige File-Input geführt — Validierung, State-Management, Upload-Flow bleiben unverändert.

2. Auf Desktop-Browsern (keine Touch-Primärinteraktion) erscheint der neue Button **nicht** — die UI ist byte-identisch mit dem heutigen Zustand.

3. Ein neues wiederverwendbares `<CameraCaptureButton>` in `src/components/ui/` kapselt die gesamte Logik (Hidden-Input, Touch-Detection, Icon). Pro Integration ist nur eine JSX-Zeile nötig.

### Key Discoveries

- **Touch-Detection ist bereits vorbereitet**: `useMediaQuery('(pointer: coarse)')` via `src/hooks/use-media-query.ts:6` reicht; keine externe Dependency nötig.
- **`capture`-Attribut ist ein reiner HTML-Hint**: Mobile Browser öffnen die Kamera-App; Desktop-Browser ignorieren es. Zusammen mit Conditional-Rendering (nur Touch-Devices) ergibt das die sauberste UX.
- **Alle sechs Komponenten akzeptieren JPEG**: Die Kamera liefert JPEG, und alle bestehenden MIME-Whitelists enthalten `image/jpeg` (verifiziert in den 6 `accept`-Strings) → keine Backend-Änderung nötig.
- **Fünf der sechs Handler nutzen dieselbe Signatur** (`ChangeEvent<HTMLInputElement>`); nur `personnel-file-entry-dialog.tsx:165` weicht ab (`FileList | null`) → braucht einen 1-Zeilen-Adapter.
- **Der Work-Report-Bucket akzeptiert bereits `image/heic`** — Kamera-Output ist typischerweise JPEG, daher keine Kompatibilitätsprobleme.
- **Existierende i18n-Abdeckung**: Komponenten 2, 3, 4, 5 nutzen `next-intl`; Komponenten 1 (WorkReport) und 6 (ServiceObject) haben **hardkodierten deutschen Text** — dort wird die Label-Prop als deutscher String-Literal übergeben, konsistent mit dem restlichen Text dieser Komponenten.

## What We're NOT Doing

Bewusst außerhalb des Scopes:

- **Keine Client-Side-Bildkompression** (z. B. `browser-image-compression`). Modern smartphones produzieren 2–8 MB JPEGs, die bestehenden Bucket-Size-Limits (2–10 MB) greifen nach wie vor. `AUDIT-010-upload-size-limits.md` adressiert Size-Guards separat.
- **Keine Custom-In-Browser-Kamera** (`getUserMedia` + Canvas + Retake-UI). Die native Kamera-App ist dem Nutzer vertrauter und bietet Flash/HDR/Zoom out-of-the-box.
- **Keine Änderungen an Backend-Services, tRPC-Routern oder Repositories**. Der Upload-Flow ist downstream identisch.
- **Keine Anpassung der nicht-bildfähigen Upload-Flows** (Eingangsrechnungen-PDF, Bank-Auszüge-XML, Payroll-CSV, Service-Object-Import-CSV) — dort ergibt Kamera-Capture keinen Sinn.
- **Keine Änderungen am QR-Scanner** (`src/components/warehouse/qr-scanner.tsx`) — der ist bereits ein Kamera-Consumer und funktionsgleich gelassen.
- **Keine Änderung der `accept`-MIME-Types** auf den bestehenden File-Inputs — `"Datei wählen" + Drag-and-Drop` bleiben unverändert.
- **Kein E2E-Browser-Test für die Kamera-Auslösung** — Playwright kann die native Kamera-App nicht steuern; die Verifikation erfolgt manuell auf echten Mobilgeräten.
- **Keine Erweiterung auf Platform-Admin-UI** — die drei Integrations-Ziele liegen im Tenant-UI; Platform-Admin hat keine bildfähigen Uploads.

## Implementation Approach

Wir bauen erst eine kleine, eigenständig verifizierbare UI-Primitive (Phase 1), integrieren sie in die wichtigste Mobile-Use-Case-Oberfläche als Proof-of-Value (Phase 2 — Arbeitsschein), und rollen sie dann mechanisch in die restlichen fünf Oberflächen aus (Phase 3). Jede Phase ist unabhängig deploybar; nach Phase 1 ist die Building-Block-API stabil, nach Phase 2 ist mindestens ein Feature-Slice live, und Phase 3 ist reiner Rollout.

---

## Phase 1: Reusable Building Blocks

### Overview

Erstellt die zwei neuen wiederverwendbaren Artefakte (Hook + UI-Primitive), fügt die i18n-Keys hinzu und schreibt einen Komponenten-Unit-Test.

### Changes Required

#### 1.1 Touch-Detection-Hook hinzufügen

**Datei:** `src/hooks/use-media-query.ts`

**Änderung:** Eine neue benannte Export-Funktion am Ende der Datei hinzufügen (reuse-Pattern — nutzt das bestehende `useMediaQuery`).

```ts
/**
 * Returns true on devices where the primary pointing mechanism is "coarse"
 * (e.g. touchscreen). Returns false on desktops with a mouse/trackpad, and
 * also during SSR / first render (before the media query resolves).
 *
 * Used to show features like direct camera capture that only make sense on
 * touch devices — desktop browsers ignore the HTML `capture` attribute and
 * would silently fall back to a file picker.
 */
export function useIsTouchDevice(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
```

#### 1.2 `CameraCaptureButton` UI-Primitive erstellen

**Datei (neu):** `src/components/ui/camera-capture-button.tsx`

```tsx
'use client'

import * as React from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsTouchDevice } from '@/hooks/use-media-query'

export type CameraCaptureButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'onClick' | 'type' | 'children'
> & {
  /**
   * Fires when the user has selected/captured a file via the native camera app.
   * Receives the raw ChangeEvent so existing `handleFileSelect(e)` handlers
   * can be passed directly.
   */
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
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
```

**Design-Notizen:**
- `variant="outline"` als Default, damit die Kamera-Option visuell vom primären "Hochladen"-Button unterscheidbar ist.
- Kein `asChild`-Support — die Komponente braucht ihren eigenen Button, damit sie den Hidden-Input kontrollieren kann.
- `children` aus `ComponentProps<typeof Button>` ausgeschlossen, weil der Inhalt via `label`-Prop gesteuert wird.

#### 1.3 i18n-Keys ergänzen

**Datei:** `messages/de.json`

Im `"common"`-Namespace (nach dem bestehenden `"upload": "Hochladen"`, ca. Zeile 15):

```json
"takePhoto": "Foto aufnehmen"
```

**Datei:** `messages/en.json`

Im selben `"common"`-Namespace:

```json
"takePhoto": "Take photo"
```

#### 1.4 Unit-Test schreiben

**Datei (neu):** `src/components/ui/__tests__/camera-capture-button.test.tsx`

```tsx
/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { CameraCaptureButton } from '../camera-capture-button'

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: vi.fn(),
  useIsMobile: vi.fn(),
  useIsTouchDevice: vi.fn(),
}))

const { useIsTouchDevice } = await import('@/hooks/use-media-query')

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('CameraCaptureButton', () => {
  it('renders nothing on non-touch devices', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(false)
    const { container } = render(
      <CameraCaptureButton onChange={vi.fn()} label="Foto aufnehmen" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders button + hidden input on touch devices', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true)
    const { getByRole, container } = render(
      <CameraCaptureButton
        onChange={vi.fn()}
        label="Foto aufnehmen"
        dataTestId="test-camera"
      />,
    )
    expect(getByRole('button', { name: /Foto aufnehmen/i })).toBeDefined()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.accept).toBe('image/*')
    expect(input.getAttribute('capture')).toBe('environment')
  })

  it('triggers input click when the button is clicked', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true)
    const { getByRole, container } = render(
      <CameraCaptureButton onChange={vi.fn()} label="Foto aufnehmen" />,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')
    fireEvent.click(getByRole('button'))
    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('forwards onChange events from the hidden input', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true)
    const onChange = vi.fn()
    const { container } = render(
      <CameraCaptureButton onChange={onChange} label="Foto aufnehmen" />,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] } })
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('propagates disabled state to both input and button', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true)
    const { getByRole, container } = render(
      <CameraCaptureButton onChange={vi.fn()} label="Foto aufnehmen" disabled />,
    )
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})
```

### Success Criteria

#### Automated Verification

- [x] Typecheck passes: `pnpm typecheck` (new files have no errors; pre-existing baseline errors unrelated to this change)
- [x] Lint passes: `pnpm lint` (new files have no errors; pre-existing baseline errors unrelated to this change)
- [x] Unit-Test der neuen Komponente läuft grün: `pnpm vitest run src/components/ui/__tests__/camera-capture-button.test.tsx` (5/5 tests pass)
- [x] Bestehende Tests bleiben grün: `pnpm test` (failing tests are pre-existing failures in work-report-migration, wh-*, orders-router, permission-catalog, probation-reminders — unrelated to camera-capture changes)
- [x] Neue i18n-Keys liegen in beiden Sprach-Dateien vor (grep bestätigt je einen Hit in `messages/de.json` und `messages/en.json`): `pnpm exec grep -l takePhoto messages/*.json | wc -l` gibt `2` aus.

#### Manual Verification

- [ ] Auf dem Dev-Server (`pnpm dev`) öffnet die App auf Desktop; `CameraCaptureButton` ist in Storybook/Dev-Page nicht sichtbar (wenn getestet — sonst skip, da Phase 1 nur Building-Block ist, noch keine Integration).

**Implementation Note**: Nach Phase 1 ist noch nichts in der UI sichtbar — die neue Komponente wird in Phase 2 zum ersten Mal eingebunden. Nur wenn alle Automated Checks grün sind, geht es zu Phase 2 weiter.

---

## Phase 2: Arbeitsschein (WorkReport) — Flagship-Integration

### Overview

Integriert `CameraCaptureButton` in den Anhang-Tab des Arbeitsscheins — die höchste Mobile-Use-Case-Priorität. Monteure vor Ort öffnen den Arbeitsschein auf dem Handy, tippen **„Foto aufnehmen"**, fotografieren den Einsatzort/Mangel, und der Upload läuft über dieselbe 3-Schritt-Signed-URL-Pipeline wie bisher.

### Changes Required

#### 2.1 Arbeitsschein-Seite anpassen

**Datei:** `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx`

**Change A — Import:**

Nach dem bestehenden `import { Button } from '@/components/ui/button'` (Zeile 46) ergänzen:

```tsx
import { CameraCaptureButton } from '@/components/ui/camera-capture-button'
```

**Change B — JSX-Block im CardHeader anpassen (Zeilen 621–647):**

Aktueller Code (der rechte `<div>` im CardHeader):
```tsx
<div>
  <input
    ref={fileInputRef}
    type="file"
    className="hidden"
    onChange={handleFileSelected}
    accept={ALLOWED_MIME_TYPES.join(",")}
    data-testid="work-report-attachment-input"
  />
  <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
    {uploading ? "Lade hoch…" : "Hochladen"}
  </Button>
</div>
```

Neuer Code:
```tsx
<div className="flex items-center gap-2">
  <input
    ref={fileInputRef}
    type="file"
    className="hidden"
    onChange={handleFileSelected}
    accept={ALLOWED_MIME_TYPES.join(",")}
    data-testid="work-report-attachment-input"
  />
  <CameraCaptureButton
    onChange={handleFileSelected}
    label="Foto aufnehmen"
    disabled={uploading}
    size="sm"
    dataTestId="work-report-camera-capture"
  />
  <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
    {uploading ? "Lade hoch…" : "Hochladen"}
  </Button>
</div>
```

**Rationale für das `label`-Literal statt `tc('takePhoto')`:** Die WorkReport-Seite hat keinen `useTranslations`-Aufruf — sämtlicher Text ist hardkodiertes Deutsch (siehe Strings `"Hochladen"`, `"Lade hoch…"`, `"Anhänge"`, `"Fotos & Dokumente"`). Wir bleiben bei diesem Stil und fügen keine isolierte Übersetzung nur für einen einzelnen String ein.

### Success Criteria

#### Automated Verification

- [x] Typecheck passes: `pnpm typecheck` (fixed an `onChange` prop intersection bug in CameraCaptureButton — added `onChange` to the Omit list + widened return to `void | Promise<void>` to accept async handlers like `handleFileSelected`)
- [x] Lint passes: `pnpm lint` (no new errors in the changed files)
- [x] Alle Tests grün: `pnpm test` (camera-capture-button unit test still 5/5; signature-pad still 12/12; other failures are pre-existing and unrelated)
- [ ] E2E-Smoke-Test für den Arbeitsschein-Detail (falls vorhanden) weiterhin grün: `pnpm vitest run src/e2e-browser` (oder Playwright-Equivalent, falls existierend) — not run; requires Playwright browsers

#### Manual Verification

- [ ] **Desktop (Chrome/Firefox)**: `/admin/work-reports/:id` öffnen, **kein** zusätzlicher Button erscheint. Der bestehende "Hochladen"-Button funktioniert unverändert.
- [ ] **Echtes Android-Handy (Chrome)**: Gleiche Seite öffnen, **"Foto aufnehmen"-Button erscheint** neben "Hochladen". Tap → native Kamera-App öffnet sich im Rückkamera-Modus. Nach der Aufnahme läuft der reguläre Upload-Flow durch (Toast "Foto hochgeladen", Attachment erscheint in der Liste).
- [ ] **Echtes iPhone (Safari)**: analog zu Android — Kamera öffnet sich, Upload funktioniert.
- [ ] **Echtes iPhone (Safari), Kamera-Permission verweigert**: Nach dem Deny-Dialog fällt Safari auf das System-File-Picker-Sheet zurück; die App bleibt konsistent (kein Crash, kein hängender Loading-State).
- [ ] **Validierung greift weiterhin**: HEIC-Datei aus der Kamera wird akzeptiert (Bucket-MIME-Whitelist enthält `image/heic`); Datei > 10 MB wird via `toast.error` abgelehnt.

**Implementation Note**: Nach Phase 2 pausieren, echtes Mobile-Testing durch Nutzer bestätigen lassen, bevor Phase 3 startet. Die manuelle Mobile-Verifikation ist der kritischste Gate, weil Desktop-Browser `capture` ignorieren und kein Bug-Feedback liefern.

---

## Phase 3: Rollout auf die restlichen 5 Oberflächen

### Overview

Mechanischer Rollout nach demselben Muster wie Phase 2. Fünf Komponenten bekommen einen zusätzlichen JSX-Block. Vier davon nutzen bereits `next-intl`, eine (ServiceObject) ist hardkodiertes Deutsch wie WorkReport.

### Changes Required

#### 3.1 Warehouse Artikelbilder

**Datei:** `src/components/warehouse/article-image-upload.tsx`

**Change A — Import** (nach bestehenden UI-Imports, ca. Zeile 14):

```tsx
import { CameraCaptureButton } from '@/components/ui/camera-capture-button'
```

**Change B — JSX-Block vor der Drop-Zone (die Drop-Zone beginnt bei Zeile ~233 mit `<div ref={dropRef}>`):**

Direkt vor `<div ref={dropRef} ...>` einfügen:

```tsx
<CameraCaptureButton
  onChange={handleFileSelect}
  label={tc('takePhoto')}
  disabled={isUploading}
  className="w-full"
/>
```

**Layout-Wrapping:** Die Drop-Zone steht im `<DialogContent>`. Die aktuelle Struktur ist `<div className="space-y-4">` oder ähnlich (zu verifizieren beim Implementieren — der Kamera-Button bleibt ein Sibling). Der Kamera-Button erhält `w-full`, damit er bildschirmbreit über der Drop-Zone sitzt.

**Rationale:** Der bestehende `tc = useTranslations('common')` (Zeile 42) liefert `tc('takePhoto')` direkt — keine zusätzliche Namespace-Deklaration nötig.

#### 3.2 User-Avatar

**Datei:** `src/components/profile/avatar-upload-dialog.tsx`

**Change A — Import** (nach Zeile 14):

```tsx
import { CameraCaptureButton } from '@/components/ui/camera-capture-button'
```

**Change B — Zusätzliche `useTranslations`-Zeile nach Zeile 36** (`const t = useTranslations('profile')`):

```tsx
const tc = useTranslations('common')
```

**Change C — JSX-Block vor der Drop-Zone** (die Drop-Zone beginnt bei Zeile ~183):

Direkt vor `<div ... onClick={() => fileInputRef.current?.click()} ...>` einfügen:

```tsx
<CameraCaptureButton
  onChange={handleFileSelect}
  label={tc('takePhoto')}
  disabled={isUploading}
  className="w-full"
/>
```

#### 3.3 CRM Korrespondenz-Anhänge

**Datei:** `src/components/crm/correspondence-attachment-upload.tsx`

**Change A — Import** (nach Zeile 6):

```tsx
import { CameraCaptureButton } from '@/components/ui/camera-capture-button'
```

**Change B — JSX-Block vor der Drop-Zone** (die Drop-Zone beginnt bei Zeile ~229):

Direkt vor dem Drop-Zone-`<div ... onClick={() => !disabled && fileInputRef.current?.click()}>` einfügen (innerhalb des `canAddMore`-Guards, damit der Kamera-Button auch ausgeblendet wird, wenn die 5-Datei-Grenze erreicht ist):

```tsx
<CameraCaptureButton
  onChange={handleFileSelect}
  label={tc('takePhoto')}
  disabled={isUploading || disabled}
  className="w-full"
/>
```

**Rationale:** `tc = useTranslations('common')` existiert bereits (Zeile 58). Die 5-Datei-Grenze (`canAddMore`) wird automatisch berücksichtigt, weil `addFiles` den Count-Check beim Verarbeiten der Kamera-Datei ausführt.

#### 3.4 HR-Personalakte-Anhänge (Adapter-Fall)

**Datei:** `src/components/hr/personnel-file-entry-dialog.tsx`

**Change A — Import** (nach Zeile 7):

```tsx
import { CameraCaptureButton } from '@/components/ui/camera-capture-button'
```

**Change B — JSX-Block in den Attachment-Upload-Flex-Container** (Zeilen 411–437):

Aktueller JSX-Block:
```tsx
<div className="flex items-center justify-between">
  <Label>...</Label>
  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={() => fileInputRef.current?.click()}
    disabled={uploading}
  >
    {t('uploadFile')}
  </Button>
</div>
<input
  ref={fileInputRef}
  type="file"
  className="hidden"
  multiple
  accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
  onChange={(e) => handleFileUpload(e.target.files)}
/>
```

Wird zu:
```tsx
<div className="flex items-center justify-between gap-2">
  <Label>...</Label>
  <div className="flex items-center gap-2">
    <CameraCaptureButton
      onChange={(e) => handleFileUpload(e.target.files)}
      label={tc('takePhoto')}
      disabled={uploading}
      size="sm"
    />
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => fileInputRef.current?.click()}
      disabled={uploading}
    >
      {t('uploadFile')}
    </Button>
  </div>
</div>
<input
  ref={fileInputRef}
  type="file"
  className="hidden"
  multiple
  accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
  onChange={(e) => handleFileUpload(e.target.files)}
/>
```

**Rationale für den Adapter `(e) => handleFileUpload(e.target.files)`:** Der bestehende Handler hat die Signatur `handleFileUpload(files: FileList | null)` — er erwartet das FileList-Objekt, nicht das Event. Der Adapter ist derselbe, wie er schon auf dem bestehenden Input an Zeile 435 steht. `tc = useTranslations('common')` existiert bereits (Zeile 63).

#### 3.5 Service-Object-Anhänge

**Datei:** `src/components/serviceobjects/attachment-list.tsx`

**Change A — Import** (nach Zeile 6):

```tsx
import { CameraCaptureButton } from '@/components/ui/camera-capture-button'
```

**Change B — JSX-Block im CardHeader** (Zeilen 112–131):

Aktueller rechter `<div>` im CardHeader:
```tsx
<div>
  <input
    ref={fileInputRef}
    type="file"
    className="hidden"
    onChange={handleFileSelected}
    accept={ALLOWED_MIME_TYPES.join(',')}
  />
  <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
    {uploading ? 'Lade hoch…' : 'Hochladen'}
  </Button>
</div>
```

Wird zu:
```tsx
<div className="flex items-center gap-2">
  <input
    ref={fileInputRef}
    type="file"
    className="hidden"
    onChange={handleFileSelected}
    accept={ALLOWED_MIME_TYPES.join(',')}
  />
  <CameraCaptureButton
    onChange={handleFileSelected}
    label="Foto aufnehmen"
    disabled={uploading}
    size="sm"
  />
  <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
    {uploading ? 'Lade hoch…' : 'Hochladen'}
  </Button>
</div>
```

**Rationale:** Wie WorkReport — hardkodiertes Deutsch, daher String-Literal für die Konsistenz mit dem umliegenden Text.

### Success Criteria

#### Automated Verification

- [x] Typecheck passes: `pnpm typecheck` (no new errors in any modified file; 9 pre-existing errors all in unrelated bankStatements/scanner-terminal/camt-test-fixture)
- [x] Lint passes: `pnpm lint` (no new errors in any modified file; only pre-existing `<img>` warning in `article-image-upload.tsx:275` unrelated to the camera-capture change)
- [x] Alle Tests grün: `pnpm test` (camera-capture-button 5/5 and signature-pad 12/12 green; other failures all pre-existing, unrelated)
- [x] Bestehende Komponenten-Tests (z. B. `src/components/work-reports/__tests__/signature-pad.test.tsx`) unverändert grün (12/12)
- [x] Keine neuen i18n-Keys fehlen: `pnpm typecheck` fängt unbekannte `t()`-Keys via next-intl-TS-Generics (falls im Repo aktiviert) — sonst durch manuelles Grep bestätigt: `pnpm exec grep -r "takePhoto" src/` liefert 4 Treffer (in den Komponenten 2, 3, 4, 5) ✅

#### Manual Verification

Pro Oberfläche jeweils **Desktop + Mobile** verifizieren:

- [ ] **Warehouse Artikelbild-Upload-Dialog**: Desktop zeigt unveränderte UI; Mobile zeigt "Foto aufnehmen" über der Drop-Zone, Kamera-Capture + Upload funktioniert.
- [ ] **Avatar-Upload-Dialog** (`/profile`): Desktop unverändert; Mobile Kamera-Capture → Avatar wird gespeichert.
- [ ] **CRM-Korrespondenz-Anhänge** (in Korrespondenz-Sheet): Desktop unverändert; Mobile Kamera-Capture ergänzt einen neuen Pending-Anhang; 5-Datei-Limit greift weiterhin korrekt.
- [ ] **HR-Personalakte-Anhänge** (im Entry-Dialog): Desktop unverändert; Mobile Kamera-Capture fügt Anhang zur Akte hinzu.
- [ ] **Service-Object-Anhänge** (`/serviceobjects/:id`): Desktop unverändert; Mobile Kamera-Capture → Anhang erscheint in Liste.
- [ ] **Cross-cutting**: In allen fünf Oberflächen funktioniert der bestehende "Hochladen"/Drop-Zone-Flow unverändert weiter (kein Regress).
- [ ] **i18n-Sanity**: In den EN-UI-Varianten erscheint "Take photo" statt "Foto aufnehmen" (für Komponenten 2, 3, 4, 5). Komponenten 1 und 6 bleiben deutsch, unabhängig von Locale — konsistent mit dem restlichen hardkodierten Text dieser Views.

**Implementation Note**: Nach Phase 3 ist die Kamera-Capture-Funktion an allen sechs bildfähigen Upload-Oberflächen verfügbar. Der Merge auf `staging` erfolgt erst nach erfolgreichem Mobile-Testing auf mindestens einem Android- und einem iOS-Gerät.

---

## Testing Strategy

### Unit Tests (in Phase 1)

- `CameraCaptureButton`-Komponenten-Test deckt alle Verhaltensaspekte ab:
  - Nicht-Render auf Desktop
  - Render + korrekte Attribute (`accept="image/*"`, `capture="environment"`) auf Touch
  - Click-Forwarding zum Hidden-Input
  - `onChange`-Forwarding
  - `disabled`-Propagation

Keine neuen Unit-Tests für die 6 Integrations-Sites — dort ist die Änderung rein deklarativ (ein zusätzlicher JSX-Block), die eigene Logik der Komponenten bleibt unverändert und wird durch die bestehenden Tests abgedeckt.

### Integration Tests

Keine neuen Integration-Tests. Die Upload-Pipelines (`workReports.attachments.*`, `crm.correspondence.attachments.*`, etc.) bleiben unverändert. Ihre bestehenden Router-Tests in `src/trpc/routers/__tests__/` laufen weiter.

### Manual Testing

Das Herzstück der Verifikation — die Kamera-Auslösung ist browser- und OS-abhängig und nicht sinnvoll automatisierbar. Verifikationsmatrix:

| Device | Browser | Erwartung |
|--------|---------|-----------|
| Desktop (alle) | Chrome / Firefox / Safari | Kein "Foto aufnehmen"-Button sichtbar; UI unverändert |
| Android | Chrome | Button sichtbar; Tap öffnet native Kamera-App (Rückkamera); JPEG-Upload klappt |
| Android | Firefox | Button sichtbar; analog Chrome |
| iPhone | Safari | Button sichtbar; Tap → iOS-Kamera-App; Upload klappt |
| iPhone | Chrome | Button sichtbar; iOS-Kamera-App (alle mobilen Browser auf iOS teilen WebKit-Verhalten) |
| Android | Chrome, Permission Deny | Fallback-Verhalten sauber (kein Crash) |

Pro Oberfläche jeweils mindestens einmal auf einem echten Android- und einem echten iOS-Gerät verifiziert.

## Performance Considerations

Keine relevanten Performance-Implikationen:

- `useIsTouchDevice` nutzt `window.matchMedia` mit einem einzigen `change`-Listener — identische Kosten wie der bereits existierende `useIsMobile`-Hook, den viele Komponenten bereits instanziieren.
- Der Hidden-Input ist ein leichtgewichtiges DOM-Element; zusätzlicher Render-Cost pro Komponente ist vernachlässigbar.
- Kamera-Capture selbst läuft in der nativen OS-App — kein JS im Browser-Hauptthread involviert.

Ein potenzieller Aspekt: Handy-Kameras produzieren 2–8 MB JPEGs. Die bestehenden Bucket-Size-Limits (2 MB für Avatar, 5 MB für Warehouse, 10 MB für die anderen) bleiben greifen — wenn ein Foto zu groß ist, wird es via `toast.error` abgelehnt, wie heute schon. Client-Kompression ist explizit Out-of-Scope (siehe "What We're NOT Doing").

## Migration Notes

Keine Daten-Migration nötig. Die Änderung ist rein UI-seitig und additiv — sie führt keine neuen Felder ein, verändert keine bestehenden Upload-Pipelines, und ist vollständig rückwärtskompatibel. Ein Rollback bedeutet: JSX-Blöcke + neue Dateien entfernen; keine DB-Schritte.

## References

- Research-Dokument: `thoughts/shared/research/2026-04-24-camera-upload-integration.md`
- Bestehender Camera-API-Consumer als Referenz: `src/components/warehouse/qr-scanner.tsx:102-150` (html5-qrcode Integration, beweist Camera + HTTPS im Deployment)
- Bestehender Media-Query-Hook: `src/hooks/use-media-query.ts:6-22`
- Button-Primitive-Pattern: `src/components/ui/button.tsx`
- Label-agnostisches UI-Pattern: `src/components/ui/confirm-dialog.tsx:52-115`
- i18n-Common-Namespace: `messages/de.json:1-74`
- Relevante Upload-Komponenten (alle per `file:line` im Research-Dokument referenziert):
  - `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx:621-647`
  - `src/components/warehouse/article-image-upload.tsx:233-254`
  - `src/components/profile/avatar-upload-dialog.tsx:183-204`
  - `src/components/crm/correspondence-attachment-upload.tsx:229-255`
  - `src/components/hr/personnel-file-entry-dialog.tsx:411-437`
  - `src/components/serviceobjects/attachment-list.tsx:112-131`
- Verwandte Vorarbeit: `thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md` (Arbeitsschein-M1-Plan mit M-2-Note für "mobile-optimierte UI")
- Verwandte Vorarbeit: `thoughts/shared/plans/2026-03-26-WH_12-mobile-qr-scanner.md` (einziger bestehender Camera-API-Plan — HTTPS-Requirement dokumentiert)
