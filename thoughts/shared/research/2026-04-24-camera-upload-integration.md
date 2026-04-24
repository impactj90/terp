---
date: 2026-04-24T13:37:36+02:00
researcher: tolga
git_commit: 2aff2f0bdd3046f39fcac547e2b860e6169cf412
branch: staging
repository: terp
topic: "Datei-/Bild-Upload-Bereiche und Kamera-API-Anbindung"
tags: [research, codebase, upload, attachments, camera, mobile, arbeitsschein, workreport, html5-capture]
status: complete
last_updated: 2026-04-24
last_updated_by: tolga
---

# Research: Datei-/Bild-Upload-Bereiche und Kamera-API-Anbindung

**Date**: 2026-04-24T13:37:36+02:00
**Researcher**: tolga
**Git Commit**: 2aff2f0bdd3046f39fcac547e2b860e6169cf412
**Branch**: staging
**Repository**: terp

## Research Question

Beim Arbeitsschein und an anderen Stellen kann man Dateien hochladen (überall wo man Bilder hinzufügen kann). Finde alle Bereiche, wo man Bilder/Dateien hochladen kann, und prüfe, ob die Kamera-API angesprochen wird, sodass Nutzer direkt Bilder machen und uploaden können — insbesondere für den mobilen Einsatz vor Ort.

## Summary

Die Terp-Codebasis hat **sechs File-Upload-Oberflächen**, auf denen Bilder oder Dokumente hochgeladen werden können. Alle sechs verwenden den Standard-`<input type="file">`-Mechanismus **ohne** das HTML5-`capture`-Attribut. Das bedeutet: Auf Mobilgeräten zeigt das Betriebssystem den generischen Datei-Picker (typischerweise "Foto-Mediathek", "Datei wählen", "Kamera" als gleichrangige Optionen). Es gibt **keine** Upload-Oberfläche, die die Kamera als primäre oder direkte Aufnahmequelle anbietet.

Das **einzige Stück Code, das tatsächlich die Kamera-API anspricht**, ist der QR-Code-Scanner im Warehouse-Modul (`src/components/warehouse/qr-scanner.tsx`). Dieser nutzt die Library `html5-qrcode` (v2.3.8), die intern `navigator.mediaDevices.getUserMedia({ facingMode: 'environment' })` aufruft — er ist jedoch ein reiner Scanner und nicht mit dem Upload-Flow verbunden.

Weitere Kamera-/Media-APIs (`navigator.mediaDevices.getUserMedia` direkt, `MediaStream`, `MediaRecorder`, WebRTC, `permissions.query({name: 'camera'})`) sowie Upload-orientierte Kamera-Bibliotheken (`react-camera-pro`, `react-webcam`, `browser-image-compression`) sind **nicht installiert** bzw. nicht verwendet.

## Detailed Findings

### Die 6 Upload-Oberflächen im Überblick

| # | Feature | Datei | `capture`? | Multiple? | Trigger |
|---|---------|-------|------------|-----------|---------|
| 1 | Arbeitsschein (WorkReport) Anhänge | `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx:624` | NEIN | NEIN | Button → `ref.click()` |
| 2 | Warehouse Artikelbilder | `src/components/warehouse/article-image-upload.tsx:246` | NEIN | JA | Drop-Zone + Click |
| 3 | User-Avatar | `src/components/profile/avatar-upload-dialog.tsx:197` | NEIN | NEIN | Drop-Zone + Click |
| 4 | CRM Korrespondenz-Anhänge | `src/components/crm/correspondence-attachment-upload.tsx:245` | NEIN | JA | Drop-Zone + Click |
| 5 | HR Personalakte Anhänge | `src/components/hr/personnel-file-entry-dialog.tsx:429` | NEIN | JA | Button → `ref.click()` |
| 6 | Service-Object Anhänge | `src/components/serviceobjects/attachment-list.tsx:116` | NEIN | NEIN | Button → `ref.click()` |

Zusätzlich existieren **reine Dokument-Upload-Flows** (keine Bilder, keine mobile Foto-Relevanz):
- Eingangsrechnungen (`src/components/invoices/inbound-invoice-upload-dialog.tsx`) — `application/pdf`
- Bank-Auszüge (`src/components/bank/bank-statement-upload-dialog.tsx`) — CAMT XML
- Payroll-Bulk-Import (`src/app/[locale]/(dashboard)/admin/payroll-import/page.tsx`) — `.csv`, `.xlsx`
- Service-Object-Import (`src/app/[locale]/(dashboard)/serviceobjects/import/page.tsx`) — CSV

---

### 1. Arbeitsschein (WorkReport) Photo-Attachments

Die Seite `/admin/work-reports/[id]` enthält einen Tab "Anhänge", in dem Monteure Vor-Ort-Fotos und Dokumente hochladen.

**Datei:** `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx:624-631`

```jsx
<input
  ref={fileInputRef}
  type="file"
  className="hidden"
  onChange={handleFileSelected}
  accept={ALLOWED_MIME_TYPES.join(",")}
  data-testid="work-report-attachment-input"
/>
```

`ALLOWED_MIME_TYPES` (Zeilen 79–85): `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`.

Der Input ist versteckt (`className="hidden"`); ein separater `<Button>` (Zeilen 632–639) ruft `fileInputRef.current?.click()` auf.

**Mobil:** Ohne `capture`-Attribut öffnet iOS/Android den generischen Datei-Picker. Kamera ist eine von mehreren Optionen, kein direkter Shortcut.

**Backend-Pipeline:**
- Router: `src/trpc/routers/workReports.ts` — Endpoints `attachments.getUploadUrl`, `attachments.confirmUpload`, `attachments.getDownloadUrl`, `attachments.remove`
- Service: `src/lib/services/work-report-attachment-service.ts` — Bucket `workreport-attachments`, max 30 Anhänge pro Report
- Repository: `src/lib/services/work-report-attachment-repository.ts`
- Hook: `src/hooks/use-work-reports.ts` — `useWorkReportAttachmentGetUploadUrl`, `useWorkReportAttachmentConfirmUpload`

Der Upload-Flow ist ein 3-Schritt-Signed-URL-Pattern (getUploadUrl → direkter PUT zur Supabase Storage → confirmUpload).

---

### 2. Warehouse-Artikelbilder

**Datei:** `src/components/warehouse/article-image-upload.tsx:246-253`

```jsx
<input
  ref={fileInputRef}
  type="file"
  accept="image/jpeg,image/png,image/webp"
  multiple
  className="hidden"
  onChange={handleFileSelect}
/>
```

Attribute präsent: `ref`, `type`, `accept`, `multiple`, `className`, `onChange`. **`capture` ABWESEND.**

Die Komponente nutzt außerdem manuelles Drag-and-Drop (`onDrop`/`onDragOver` an einem umschließenden `<div>`, Zeilen 115–129), nicht die Library `react-dropzone` — hier wird native React-DragEvent-Logik verwendet.

**Backend-Pipeline:**
- Router: `src/trpc/routers/warehouse/articles.ts` — `images.getUploadUrl`, `images.confirm`, `images.delete`, `images.setPrimary`, `images.reorder`
- Service: `src/lib/services/wh-article-image-service.ts` — Bucket `wh-article-images`, serverseitige Thumbnail-Generierung via `sharp`
- Hook: `src/hooks/use-wh-article-images.ts` — `useWhArticleImagesUpload`

---

### 3. User-Avatar-Upload

**Datei:** `src/components/profile/avatar-upload-dialog.tsx:197-203`

```jsx
<input
  ref={fileInputRef}
  type="file"
  accept="image/jpeg,image/png,image/webp"
  className="hidden"
  onChange={handleFileSelect}
/>
```

`multiple` abwesend — nur ein Avatar-Bild zulässig. **`capture` ABWESEND.** Manuelles Drag-and-Drop am umschließenden Div (Zeilen 184–204).

**Backend-Pipeline:**
- Router: `src/trpc/routers/users.ts` — `avatarGetUploadUrl`, `avatarConfirmUpload`, `avatarDelete`
- Service: `src/lib/services/users-service.ts` (Zeilen 524–588) — Bucket `avatars` (öffentlich, `getPublicUrl`)
- Hook: `src/hooks/use-user.ts` — Avatar-Mutation-Hooks

---

### 4. CRM-Korrespondenz-Anhänge

**Datei:** `src/components/crm/correspondence-attachment-upload.tsx:245-253`

```jsx
<input
  ref={fileInputRef}
  type="file"
  accept="application/pdf,image/jpeg,image/png,image/webp,.docx,.xlsx"
  multiple
  className="hidden"
  onChange={handleFileSelect}
  disabled={disabled}
/>
```

`accept` mischt MIME-Types mit Dateiendungen. **`capture` ABWESEND.** Drag-and-Drop-Implementierung wie oben.

**Backend-Pipeline:**
- Router: `src/trpc/routers/crm/correspondence.ts` — `attachments.getUploadUrl`, `attachments.confirm`, `attachments.delete`, `attachments.getDownloadUrl`, `attachments.list`
- Service: `src/lib/services/crm-correspondence-attachment-service.ts` — Bucket `crm-attachments`
- Hook: `src/hooks/use-crm-correspondence-attachments.ts`

---

### 5. HR-Personalakte-Anhänge

**Datei:** `src/components/hr/personnel-file-entry-dialog.tsx:429-436`

```jsx
<input
  ref={fileInputRef}
  type="file"
  className="hidden"
  multiple
  accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
  onChange={(e) => handleFileUpload(e.target.files)}
/>
```

Nur Dateiendungen im `accept`, keine MIME-Types. **`capture` ABWESEND.** Kein Drag-and-Drop; ausschließlich Button-Trigger (Zeilen 415–428).

**Backend-Pipeline:**
- Router: `src/trpc/routers/hr/personnelFile.ts` — `attachments.getUploadUrl`, `attachments.confirm`, `attachments.delete`, `attachments.getDownloadUrl`
- Service: `src/lib/services/hr-personnel-file-attachment-service.ts` — Bucket `hr-personnel-files`, max 10 Anhänge/Eintrag
- Hook: `src/hooks/use-hr-personnel-file.ts` — `usePersonnelFileAttachmentUpload`

---

### 6. Service-Object-Anhänge

**Datei:** `src/components/serviceobjects/attachment-list.tsx:116-122`

```jsx
<input
  ref={fileInputRef}
  type="file"
  className="hidden"
  onChange={handleFileSelected}
  accept={ALLOWED_MIME_TYPES.join(',')}
/>
```

`ALLOWED_MIME_TYPES` (Zeilen 16–23): PDF, jpeg, png, webp, docx, xlsx. **`capture` ABWESEND.** Kein Drag-and-Drop; Button-Trigger (Zeilen 123–130).

**Backend-Pipeline:**
- Router: `src/trpc/routers/serviceObjects.ts` — `getUploadUrl`, `confirmUpload`, `getDownloadUrl`, `deleteAttachment`
- Service: `src/lib/services/service-object-attachment-service.ts` — Bucket `serviceobject-attachments`
- Hook: `src/hooks/use-service-objects.ts`

---

### Die einzige Kamera-Nutzung: QR-Scanner

**Datei:** `src/components/warehouse/qr-scanner.tsx`

Diese Komponente ist **kein Upload** und enthält **kein `<input type="file">`**. Sie verwendet die Library `html5-qrcode` (package.json Zeile 92: `"html5-qrcode": "^2.3.8"`) für einen reinen Scan-Workflow.

Schlüssel-Codepfade:
- Zeile 102: `const { Html5Qrcode } = await import('html5-qrcode')` — dynamischer Import (SSR-sicher)
- Zeile 109: Instanziierung gegen DOM-Element-ID
- Zeile 113: `html5QrCode.start({ facingMode: 'environment' }, ...)` — Rückkamera
- Zeilen 115–119: Scanner-Config `fps: 10`, `qrbox: { width: 250, height: 250 }`, `aspectRatio: 1`
- Zeilen 134–141: Fackel/Flashlight-Detection via `getRunningTrackCameraCapabilities`
- Zeilen 143–150: Fehlerbehandlung — bei `cameraPermissionDenied` oder sonstigem Fehler wird `setShowManualInput(true)` aufgerufen (Zeile 148), wodurch ein reines Text-`<Input>` (Zeilen 269–272) angezeigt wird
- Zeilen 171–188: Fackel-Toggle via `applyVideoConstraints`

Die Library umschließt `navigator.mediaDevices.getUserMedia` intern — an keiner anderen Stelle im Code wird `getUserMedia` direkt aufgerufen. HTTPS ist für den Kamera-Zugriff erforderlich.

**Integration:**
- Terminal-Komponente: `src/components/warehouse/scanner-terminal.tsx` (rendert `<QrScanner>` an Zeile 342)
- Seite: `src/app/[locale]/(dashboard)/warehouse/scanner/page.tsx`
- Router: `src/trpc/routers/warehouse/qr.ts`
- Permission: `src/lib/auth/permission-catalog.ts:347-348` — `wh_qr.scan`

---

### Nicht-Bild-Upload-Flows (für Vollständigkeit)

Diese Oberflächen laden Dateien, aber keine Bilder — sie sind mobil/Kamera-irrelevant:

- **Eingangsrechnungen** (`src/components/invoices/inbound-invoice-upload-dialog.tsx`) — PDF. Router `src/trpc/routers/invoices/inbound.ts` (`upload` empfängt `fileBase64`; alternativ `getUploadUrl`). Service: `src/lib/services/inbound-invoice-service.ts`. Bucket: `inbound-invoices`.
- **Bank-Auszüge** (`src/components/bank/bank-statement-upload-dialog.tsx`) — CAMT XML. Router `src/trpc/routers/bankStatements.ts` (`import` via `fileBase64`). Bucket: `bank-statements`.
- **Payroll-Bulk-Import** (`src/app/[locale]/(dashboard)/admin/payroll-import/page.tsx`) — CSV/XLSX via Base64. Router: `src/trpc/routers/payrollBulkImport.ts`. Kein Storage-Bucket; Daten direkt in DB geparst.
- **Service-Object-Import** (`src/app/[locale]/(dashboard)/serviceobjects/import/page.tsx`) — CSV via Base64.

Zusätzlich:
- **Signatur-Erfassung** (`src/components/work-reports/signature-pad.tsx`, `signature-dialog.tsx`) — Canvas-basiertes Zeichenfeld via `react-signature-canvas@1.0.6`, gibt Base64-PNG-Data-URL aus. Kein File-Upload, keine Kamera.

---

### Supabase-Storage-Buckets in Verwendung

| Bucket | Feature | Zugriff |
|--------|---------|---------|
| `avatars` | User-Avatare | Öffentlich |
| `wh-article-images` | Warehouse-Artikelbilder | Privat (Signed URLs) |
| `workreport-attachments` | Arbeitsschein-Foto-Anhänge | Privat (Signed URLs) |
| `workreport-signatures` | Arbeitsschein-Signatur-PNGs | Privat |
| `documents` | Arbeitsschein-PDF-Archiv | Privat (Signed URLs) |
| `serviceobject-attachments` | Service-Object-Fotos | Privat (Signed URLs) |
| `hr-personnel-files` | HR-Dokumente | Privat (Signed URLs) |
| `crm-attachments` | CRM-Korrespondenz-Dateien | Privat (Signed URLs) |
| `inbound-invoices` | Eingangsrechnungen-PDF | Privat (Signed URLs) |
| `bank-statements` | CAMT-XML-Bankauszüge | Privat |

Zentrale Abstraktion: `src/lib/supabase/storage.ts` — exportiert `createSignedUploadUrl`, `createSignedReadUrl`, `getPublicUrl`, `upload`, `download`, `remove`, `removeBatched`.

---

### Gemeinsame Upload-Architektur (3-Schritt-Pattern)

Fünf der sechs Upload-Komponenten (alle außer ein älterer Direct-Buffer-Flow) folgen dem gleichen Muster:

1. **Client** ruft `getUploadUrl` tRPC-Mutation auf → erhält Supabase Signed Upload URL
2. **Client** macht direktes `PUT` zur Signed URL (Bytes gehen nicht durch Terp-Backend)
3. **Client** ruft `confirmUpload` tRPC-Mutation auf → Attachment-Row wird in Postgres angelegt

Dieses Pattern wurde in `WH_13` (Artikelbilder) etabliert, in `CRM_07` wiederverwendet und für HR-Personalakte sowie Arbeitsschein-M1 übernommen.

Direct-Buffer-Ausnahmen (Upload-Bytes gehen durch tRPC-Router als Base64):
- Inbound-Invoice `upload` (Router `src/trpc/routers/invoices/inbound.ts`)
- Bank-Statement `import` (`src/trpc/routers/bankStatements.ts`)
- Payroll-Bulk-Import `parseFile`/`importFile`

---

### Dritt-Bibliotheken

Relevante Pakete aus `package.json`:

- **`html5-qrcode@^2.3.8`** (Zeile 92) — QR-Scanner, einziger Kamera-Consumer
- **`react-signature-canvas@1.0.6`** (Zeile 111) — Signatur-Pad
- **`sharp`** — serverseitige Thumbnails in `wh-article-image-service.ts`
- **`react-dropzone`** — verwendet in `article-image-upload.tsx`, `avatar-upload-dialog.tsx`, `correspondence-attachment-upload.tsx` (Anmerkung: die letzten beiden implementieren Drag-and-Drop eigentlich manuell; `useDropzone` aus `react-dropzone` wird im Code nur stellenweise gefunden — die Importsituation pro Komponente ist in den Analysen uneinheitlich dokumentiert)

**Nicht im Projekt:** `react-camera-pro`, `react-webcam`, `browser-image-compression`, `filepond`, `uppy`, `tus-js-client`.

---

### Test-Coverage

- `src/lib/services/__tests__/work-report-attachment-service.unit.test.ts`
- `src/lib/services/__tests__/work-report-attachment-service.integration.test.ts`
- `src/lib/services/__tests__/service-object-attachment-service.test.ts`
- `src/lib/services/__tests__/wh-article-image-service.test.ts`
- `src/trpc/routers/__tests__/whArticleImages-router.test.ts`
- `src/trpc/routers/__tests__/hrPersonnelFile-router.test.ts`
- `src/trpc/routers/__tests__/crmCorrespondence-router.test.ts`
- `src/components/work-reports/__tests__/signature-pad.test.tsx`

---

## Code References

### Upload-Input-Elemente (mit Zeilennummern)

- `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx:624-631` — Arbeitsschein-Anhang-Input
- `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx:79-85` — `ALLOWED_MIME_TYPES` für WorkReport
- `src/components/warehouse/article-image-upload.tsx:246-253` — Artikelbild-Input
- `src/components/warehouse/article-image-upload.tsx:115-129` — manuelles Drag-and-Drop
- `src/components/profile/avatar-upload-dialog.tsx:197-203` — Avatar-Input
- `src/components/crm/correspondence-attachment-upload.tsx:245-253` — CRM-Korrespondenz-Input
- `src/components/hr/personnel-file-entry-dialog.tsx:429-436` — HR-Personalakte-Input
- `src/components/serviceobjects/attachment-list.tsx:116-122` — Service-Object-Input

### Kamera-Zugriff (einziges Vorkommen)

- `src/components/warehouse/qr-scanner.tsx:102` — dynamischer Import `html5-qrcode`
- `src/components/warehouse/qr-scanner.tsx:113-114` — `start({ facingMode: 'environment' })`
- `src/components/warehouse/qr-scanner.tsx:134-141` — Fackel-Detection
- `src/components/warehouse/qr-scanner.tsx:143-150` — Fallback zu Manual-Input bei Permission-Denial

### Services & Routers

- `src/lib/services/work-report-attachment-service.ts` — WorkReport-Anhang-Service
- `src/lib/services/work-report-attachment-repository.ts` — WorkReport-Anhang-Repo
- `src/lib/services/service-object-attachment-service.ts`
- `src/lib/services/hr-personnel-file-attachment-service.ts`
- `src/lib/services/crm-correspondence-attachment-service.ts`
- `src/lib/services/wh-article-image-service.ts`
- `src/lib/services/users-service.ts:524-588` — Avatar-Logik
- `src/lib/supabase/storage.ts` — zentrale Storage-Helpers
- `src/trpc/routers/workReports.ts` — WorkReport-Router
- `src/trpc/routers/warehouse/articles.ts` — Artikelbilder-Router
- `src/trpc/routers/users.ts` — Avatar-Router
- `src/trpc/routers/crm/correspondence.ts`
- `src/trpc/routers/hr/personnelFile.ts`
- `src/trpc/routers/serviceObjects.ts`

### Hooks

- `src/hooks/use-work-reports.ts`
- `src/hooks/use-wh-article-images.ts`
- `src/hooks/use-user.ts`
- `src/hooks/use-crm-correspondence-attachments.ts`
- `src/hooks/use-hr-personnel-file.ts`
- `src/hooks/use-service-objects.ts`

---

## Architecture Documentation

### Upload-Pattern (3-Schritt-Signed-URL)

Alle Bild-/Foto-relevanten Upload-Flows folgen dieser Sequenz:

```
Client                          tRPC/Service               Supabase Storage
  │                                │                             │
  │  getUploadUrl(fileName, mime)  │                             │
  ├───────────────────────────────▶│                             │
  │                                │  createSignedUploadUrl()    │
  │                                ├────────────────────────────▶│
  │       signed PUT URL          │◀────────────────────────────┤
  │◀───────────────────────────────┤                             │
  │                                                              │
  │              PUT fileBytes → signed URL                      │
  ├─────────────────────────────────────────────────────────────▶│
  │                                                              │
  │  confirmUpload(storageKey)     │                             │
  ├───────────────────────────────▶│                             │
  │                                │  prisma.*.create()          │
  │                                │                             │
  │              Attachment entity │                             │
  │◀───────────────────────────────┤                             │
```

Die Client-Komponente hält das `File`-Objekt (aus `input.files[0]` oder `e.dataTransfer.files[0]`) in State, validiert MIME-Type und Größe lokal, und delegiert die Bytes selbst an Supabase. Der Terp-Backend sieht nie den Dateiinhalt.

### Datei-Auswahl-Mechanismen

Es gibt zwei gängige Trigger-Muster:

**Muster A — Button öffnet versteckten Input:**
```jsx
<input ref={fileInputRef} type="file" className="hidden" ... />
<Button onClick={() => fileInputRef.current?.click()}>Hochladen</Button>
```
Verwendet in: Arbeitsschein, HR-Personalakte, Service-Object

**Muster B — Drop-Zone-Div mit Click + manuellem Drag-and-Drop:**
```jsx
<div
  onClick={() => fileInputRef.current?.click()}
  onDrop={handleDrop}
  onDragOver={(e) => e.preventDefault()}
>
  <input ref={fileInputRef} type="file" className="hidden" ... />
  <p>Dateien hier ablegen oder klicken</p>
</div>
```
Verwendet in: Warehouse-Artikelbilder, User-Avatar, CRM-Korrespondenz

### MIME-Type-Philosophie

Die Codebasis ist bezüglich `accept` uneinheitlich:
- Manche Komponenten nutzen MIME-Types (`image/jpeg`, `application/pdf`)
- Andere nutzen Dateiendungen (`.pdf`, `.jpg`)
- CRM-Korrespondenz mischt beide

Serverseitige Validierung erfolgt über MIME-Type-Whitelists in den jeweiligen Services (nicht vertrauensvoll auf Client-`accept` bauen).

---

## Historical Context (from thoughts/)

### Pläne

- `thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md` — WorkReport-M1-Plan: Phase 4 "Attachment-Upload (Fotos)", 3-Schritt-Pipeline, `workreport-attachments`-Bucket, mobile-optimierte UI als Ziel aber M-2 zurückgestellt
- `thoughts/shared/plans/2026-03-25-WH_13-artikelbilder.md` — Das Ursprungs-Pattern für alle Foto-Uploads: `getUploadUrl` → direkter PUT → `confirmUpload`, serverseitige Sharp-Thumbnails
- `thoughts/shared/plans/2026-03-26-CRM_07-korrespondenz-anhaenge.md` — CRM-Attachment-Plan, max 5 Dateien/10 MB, Multi-File-Drag-and-Drop
- `thoughts/shared/plans/2026-03-27-HR_01-personalakte.md` — HR-Personalakte-Plan, max 20 MB, 10 Anhänge/Eintrag
- `thoughts/shared/plans/2026-03-26-WH_12-mobile-qr-scanner.md` — **Einziger Plan, der explizit die Kamera-API nutzt** (`html5-qrcode`, `facingMode: "environment"`, HTTPS-Requirement, Manual-Input-Fallback)
- `thoughts/shared/plans/2026-04-07-terp-invoice-phase1-eingangsrechnungen.md` — OCR für image-only Dateien explizit Phase 2 / out of scope
- `thoughts/shared/plans/2026-04-07-inventur-modul.md` — Referenziert kamera-basiertes Scanning (environment-facing) im Kontext des Stocktake-Mobile-Flows

### Research-Dokumente

- `thoughts/shared/research/2026-04-22-workreport-arbeitsschein-m1-codebase-analyse.md` — Explizit festgehalten: "Keine Client-Side Image-Komprimierung" (kein `browser-image-compression`), kein `capture`-Attribut in Upload-Komponenten
- `thoughts/shared/research/2026-03-27-HR_01-personalakte.md` — Dokumentiert kanonischen 3-Schritt-Flow
- `thoughts/shared/research/2026-03-26-WH_12-mobile-qr-scanner.md` — Kamera-Integration-Research für QR-Scanner
- `thoughts/shared/research/2026-03-25-WH_13-artikelbilder.md` — Ursprung des Foto-Upload-Patterns
- `thoughts/shared/research/2026-03-26-CRM_07-korrespondenz-anhaenge.md`
- `thoughts/shared/research/2026-04-07-inventur-modul.md`

### Audit / Bugs

- `thoughts/shared/audit/bugs/AUDIT-010-upload-size-limits.md` — Security-Bug: `storage.upload()` hat keinen Size-Check vor Supabase-Call; schlägt `UploadTooLargeError`-Klasse + Bucket-spezifische Limits vor

### Tickets

- `thoughts/shared/tickets/orgAuftrag/TICKET_WH_13_ARTIKELBILDER.md` — Artikelbilder
- `thoughts/shared/tickets/orgAuftrag/TICKET_WH_12_MOBILE_QR_SCANNER.md` — **Mobile QR-Scanner mit HTML5-Camera-API**
- `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_07_KORRESPONDENZ_ANHAENGE.md` — Erwähnt "Scanner-Integration für direktes Einscannen" als Zukunftsidee
- `thoughts/shared/tickets/orgAuftrag/TICKET_HR_01_PERSONALAKTE.md`
- `thoughts/shared/tickets/orgAuftrag/MOBILE_11_WAREHOUSE.md` — Mobile-Warehouse-Layout: "Barcode-Scanner Kamera-Icon-Button", "Kamera-Icon-Trigger in Artikelsuche"
- `thoughts/shared/tickets/ZMI-TICKET-111-projektmappe-dateiablage-storage.md` — Vermerkt "Mobile-Upload (ZMI-TICKET-193)" explizit als out of scope (separates Ticket geplant, nicht in diesem Repo enthalten)
- `thoughts/shared/tickets/ZMI-TICKET-154-digitale-unterschriften.md` — Digitale Signaturen (Base64-PNG-Capture)

Kein bestehendes Plan- oder Research-Dokument in thoughts/ befasst sich speziell mit dem HTML5-`capture`-Attribut für direkte Kamera-Auslösung auf Mobilgeräten.

---

## Related Research

- `thoughts/shared/research/2026-04-22-workreport-arbeitsschein-m1-codebase-analyse.md` — detaillierte Codebasis-Analyse für Arbeitsschein-M1 (inkl. aller bestehenden Attachment-Services)
- `thoughts/shared/research/2026-03-26-WH_12-mobile-qr-scanner.md` — einzige vorhandene Camera-API-Research

## Open Questions

Keine — die Ausgangsfrage ist vollständig beantwortet:
- Alle 6 Upload-Flächen lokalisiert
- Alle Input-Markups dokumentiert
- Bestätigt, dass das `capture`-Attribut an **keiner** Upload-Stelle verwendet wird
- Einzige Kamera-API-Nutzung (QR-Scanner) identifiziert und dokumentiert
