# WH_12 — Mobile QR-Scanner für Lagervorgänge

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_01 (Articles), WH_04 (Wareneingang), WH_05 (Lagerentnahmen), WH_08 (Inventur) |
| **Complexity** | L |
| **Priority** | Mittlere Priorität |
| **New Models** | `WhArticleQrCode` (Erweiterung) |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. 9: Der "Timeboy" ist ein mobiles Hardware-Terminal (Barcode/RFID) für Lagerbuchungen. Lagerzugang, Lagerabgang, Inventur und Storno werden am Gerät erfasst und per Docking-Station übertragen. Nachteil: teures Spezialgerät, Offline-/Sync-Problematik, kein Echtzeit-Feedback.

---

## Terp aktuell

- Web-basierte Software-Terminals für Wareneingang (WH_04) und Lagerentnahme (WH_05)
- Eingabe erfolgt über Artikelsuche (Textfeld mit Autocomplete)
- Kein Barcode- oder QR-Code-Scanning
- Lagermitarbeiter müssen Artikelnummern manuell suchen → langsam und fehleranfällig

---

## Goal

Eine mobile QR-Scanner-Lösung implementieren, die den ZMI Timeboy vollständig ersetzt. Mitarbeiter scannen QR-Codes mit der Handy-Kamera (HTML5 Camera API, kein nativer App-Store). Deckt ab: Wareneingang, Lagerentnahme, Inventur, Storno. QR-Codes werden pro Artikel automatisch generiert und als druckbare Etiketten (PDF) bereitgestellt. Echtzeit über WLAN/Mobilfunk statt Docking-Station.

---

## QR-Code-System

### QR-Code-Format

```
TERP:ART:{tenantId-short}:{articleNumber}
```

Beispiel: `TERP:ART:a1b2c3:ART-00042`

- Prefix `TERP:ART:` identifiziert den Code als Terp-Artikel
- `tenantId-short`: Erste 6 Zeichen der Tenant-UUID (Kollisionsvermeidung)
- `articleNumber`: Die Artikelnummer (nicht die UUID)

### QR-Code-Generierung

QR-Codes werden **on-the-fly** generiert (kein DB-Eintrag nötig). Der Inhalt ergibt sich deterministisch aus Tenant-ID + Artikelnummer.

### Etiketten-PDF

- A4-Seite mit konfigurierbarem Etiketten-Raster (z.B. 3×8 = 24 Etiketten pro Seite)
- Jedes Etikett: QR-Code (min. 2×2cm) + Artikelnummer + Bezeichnung + Einheit
- Unterstützte Etikettenformate: Avery Zweckform L4736REV (45.7×21.2mm), Custom

---

## HTML5 Camera API — Scanner

### Technologie

- **html5-qrcode** Library (MIT License, ~50KB gzip)
- Kein nativer App-Store nötig — läuft im Browser
- Benötigt HTTPS (Kamera-Zugriff nur über sichere Verbindung)
- Fallback: Manuelle Eingabe der Artikelnummer

### Scanner-Komponente

```tsx
// src/components/warehouse/qr-scanner.tsx
import { Html5QrcodeScanner } from "html5-qrcode"

export function QrScanner({ onScan }: { onScan: (articleNumber: string) => void }) {
  // 1. Kamera-Zugriff anfordern
  // 2. QR-Code dekodieren
  // 3. TERP:ART: Prefix validieren
  // 4. Tenant-ID prüfen (muss zum aktuellen Mandanten gehören)
  // 5. Artikelnummer extrahieren und onScan aufrufen
  // 6. Vibration-Feedback bei erfolgreichem Scan (navigator.vibrate)
  // 7. Audio-Feedback (kurzer Beep-Ton)
}
```

### Mobile-Optimierung

- Vollbild-Scanner auf kleinen Bildschirmen
- Große Touch-Targets (min. 48px)
- Autofokus auf Kamera
- Flashlight-Toggle (Torch API) für dunkle Lager

---

## Prisma Model Erweiterungen

### WhArticle Erweiterung

Kein neues Feld nötig — QR-Code wird deterministisch aus `tenantId` + `number` generiert.

### Etiketten-Konfiguration (Optional)

```prisma
// In SystemSettings oder als Tenant-Einstellung:
qrLabelFormat   String  @default("AVERY_L4736") @map("qr_label_format")
// Werte: "AVERY_L4736" | "AVERY_L4731" | "CUSTOM"
qrLabelWidth    Float?  @map("qr_label_width")   // mm, nur bei CUSTOM
qrLabelHeight   Float?  @map("qr_label_height")  // mm, nur bei CUSTOM
qrLabelCols     Int?    @map("qr_label_cols")     // nur bei CUSTOM
qrLabelRows     Int?    @map("qr_label_rows")     // nur bei CUSTOM
```

---

## Permissions

```ts
p("wh_qr.scan", "wh_qr", "scan", "Use QR scanner for warehouse operations"),
p("wh_qr.print", "wh_qr", "print", "Print QR code labels"),
```

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/qr.ts`

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `resolveCode` | query | `wh_qr.scan` | `{ code: string }` | QR-Code parsen und Artikel zurückgeben |
| `generateLabelPdf` | query | `wh_qr.print` | `{ articleIds: string[], format? }` | PDF mit QR-Etiketten generieren |
| `generateAllLabelsPdf` | query | `wh_qr.print` | `{ articleGroupId?, format? }` | Alle Artikel (optional gefiltert) als Etiketten |
| `generateSingleLabel` | query | `wh_qr.print` | `{ articleId }` | Einzelnes Etikett als SVG/PNG |

---

## Service Layer

**Files:**
- `src/lib/services/wh-qr-service.ts`

### Key Logic

#### QR-Code Auflösung

```ts
export async function resolveQrCode(prisma, tenantId, rawCode: string) {
  // 1. Parse: TERP:ART:{tenantShort}:{articleNumber}
  const match = rawCode.match(/^TERP:ART:([a-f0-9]{6}):(.+)$/)
  if (!match) throw new ValidationError("Ungültiger QR-Code")

  const [, tenantShort, articleNumber] = match

  // 2. Tenant-Validierung
  if (!tenantId.startsWith(tenantShort)) {
    throw new ForbiddenError("QR-Code gehört zu einem anderen Mandanten")
  }

  // 3. Artikel laden
  const article = await prisma.whArticle.findFirst({
    where: { tenantId, number: articleNumber, isActive: true },
  })
  if (!article) throw new NotFoundError("Artikel nicht gefunden")

  return article
}
```

#### Etiketten-PDF

```ts
export async function generateLabelPdf(prisma, tenantId, articleIds, format) {
  // 1. Artikel laden
  // 2. Pro Artikel QR-Code generieren (qrcode library)
  // 3. PDF mit Etikettenraster erstellen (pdfkit oder @react-pdf/renderer)
  // 4. Etiketten mit QR-Code + Text layouten
  // 5. PDF als Buffer zurückgeben
}
```

---

## UI Components

### Scanner-Seite (Mobile-First)

**Route:** `/warehouse/scanner`

**Component:** `src/components/warehouse/scanner-page.tsx`

- Große Kamera-Vorschau (80% des Bildschirms)
- Scan-Ergebnis: Artikelname + Bild + Bestand
- 4 Aktions-Buttons (Kacheln):
  - **Wareneingang** → Bestellung wählen → Menge eingeben → Buchen
  - **Entnahme** → Menge + Referenz eingeben → Buchen
  - **Inventur** → Session wählen → Menge eingeben → Zählung erfassen
  - **Storno** → Letzte Buchung anzeigen → Stornieren
- Verlauf der letzten Scans (scrollbare Liste)
- Offline-Indikator (wenn keine Verbindung)

### Wareneingang via Scanner

**Flow:**
1. Scan QR-Code → Artikel wird angezeigt
2. Offene Bestellungen für diesen Artikel anzeigen
3. Bestellung wählen (oder "ohne Bestellung")
4. Menge eingeben (großes Nummernfeld)
5. Bestätigen → Wareneingang gebucht
6. Erfolgs-Feedback (grüner Haken + Vibration)

### Entnahme via Scanner

**Flow:**
1. Scan QR-Code → Artikel + Bestand anzeigen
2. Menge eingeben
3. Referenz wählen: Auftrag / Lieferschein / Sonstige
4. Bestätigen → Entnahme gebucht

### Inventur via Scanner

**Flow:**
1. Aktive Inventursession wählen (oder neue erstellen)
2. Scan QR-Code → Artikel anzeigen + erwarteter Bestand
3. Gezählte Menge eingeben
4. Bestätigen → Zählung erfasst
5. Nächsten Artikel scannen (Endlosschleife)

### Storno via Scanner

**Flow:**
1. Scan QR-Code → Letzte Lagerbuchungen für diesen Artikel anzeigen
2. Buchung auswählen → Details prüfen
3. Bestätigen → Stornobuchung erstellt

### Etiketten-Druck

**In Artikelstamm:**
- Button "QR-Etikett drucken" im Artikeldetail
- Massenauswahl in Artikelliste → "Etiketten drucken"
- Konfiguration des Etikettenformats in Einstellungen

**Route:** `/warehouse/labels`
- Artikelgruppe wählen oder einzelne Artikel auswählen
- Vorschau der Etiketten
- PDF generieren und herunterladen

---

## Hooks

**File:** `src/hooks/use-wh-qr.ts`

```ts
export function useResolveQrCode() {
  // mutation: resolveCode
}

export function useGenerateLabelPdf() {
  // query: generateLabelPdf (lazy, triggered by button)
}

export function useScannerHistory() {
  // local state: letzte 50 Scans (localStorage)
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-qr-service.test.ts`

- `resolveQrCode` — parst gültigen TERP:ART: Code und gibt Artikel zurück
- `resolveQrCode` — rejects ungültiges Format
- `resolveQrCode` — rejects Code von anderem Mandanten
- `resolveQrCode` — rejects deaktivierten Artikel
- `resolveQrCode` — rejects unbekannte Artikelnummer
- `generateLabelPdf` — generiert PDF mit korrekter Etikettenanzahl
- `generateLabelPdf` — QR-Code enthält korrektes Format TERP:ART:{tenantShort}:{number}
- `generateLabelPdf` — respektiert Etikettenformat-Konfiguration

### Router Tests

**File:** `src/trpc/routers/__tests__/whQr-router.test.ts`

```ts
describe("warehouse.qr", () => {
  it("resolveCode — returns article for valid QR code", async () => { })
  it("resolveCode — requires wh_qr.scan permission", async () => { })
  it("resolveCode — rejects cross-tenant QR code", async () => { })
  it("generateLabelPdf — returns PDF buffer", async () => { })
  it("generateLabelPdf — requires wh_qr.print permission", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("resolveCode — Mandant A kann QR-Code von Mandant B nicht auflösen", async () => { })
  it("generateLabelPdf — generiert nur Etiketten für eigene Artikel", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/51-wh-qr-scanner.spec.ts`

```ts
test.describe("UC-WH-12: Mobile QR-Scanner", () => {
  // Note: Kamera-Tests können nicht vollständig in Playwright simuliert werden.
  // Stattdessen wird die manuelle Eingabe und die QR-Auflösung getestet.

  test("QR-Code manuell eingeben und Artikel auflösen", async ({ page }) => {
    // 1. Scanner-Seite öffnen
    // 2. Manuell Artikelnummer eingeben (Fallback ohne Kamera)
    // 3. Artikel wird angezeigt mit Bestand
  })

  test("Wareneingang über Scanner-Flow buchen", async ({ page }) => {
    // 1. Artikel auflösen
    // 2. Wareneingang-Button klicken
    // 3. Bestellung wählen, Menge eingeben
    // 4. Bestätigen → Wareneingang gebucht
    // 5. Bestand prüfen
  })

  test("Entnahme über Scanner-Flow buchen", async ({ page }) => {
    // 1. Artikel auflösen
    // 2. Entnahme-Button klicken
    // 3. Menge + Referenz eingeben
    // 4. Bestätigen → Entnahme gebucht
  })

  test("Inventurzählung über Scanner", async ({ page }) => {
    // 1. Inventursession erstellen
    // 2. Artikel auflösen
    // 3. Inventur-Button → Menge eingeben → Bestätigen
    // 4. Zählung in Session prüfen
  })

  test("Etiketten-PDF generieren", async ({ page }) => {
    // 1. Artikelliste öffnen
    // 2. Artikel auswählen
    // 3. "Etiketten drucken" klicken
    // 4. PDF wird heruntergeladen
  })

  test("Etiketten-PDF aus Einzelartikel", async ({ page }) => {
    // 1. Artikeldetail öffnen
    // 2. "QR-Etikett drucken" klicken
    // 3. Etikett wird generiert
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### QR-Code-Sicherheit
- QR-Code enthält **gekürzte** Tenant-ID (nicht vollständig) → Schutz der UUID
- Server validiert IMMER die vollständige Tenant-ID beim Auflösen
- Ein QR-Code von Mandant A kann bei Mandant B nicht aufgelöst werden
- QR-Codes sind **nicht geheim** — sie identifizieren nur den Artikel, Authentifizierung erfolgt über die Session

### Repository Layer
- `resolveQrCode` MUSS `tenantId` in der Artikel-Abfrage filtern
- Etiketten-Generierung MUSS `tenantId` filtern

### Service Layer
- Alle Scanner-Aktionen (Wareneingang, Entnahme, Inventur, Storno) gehen durch die bestehenden Service-Layer mit `tenantId`
- Keine direkte DB-Manipulation aus dem Scanner

### Tests (MANDATORY)
- Cross-Tenant QR-Code Auflösung MUSS fehlschlagen
- Etiketten dürfen nur eigene Artikel enthalten

### Pattern Reference
See `src/lib/services/wh-article-service.ts` for canonical tenant isolation pattern.

---

## Technische Anforderungen

### HTTPS
- Kamera-Zugriff erfordert HTTPS (auch lokal: `pnpm dev` mit `--experimental-https` oder via Tunnel)
- Fallback: Manuelle Eingabe wenn Kamera nicht verfügbar

### Performance
- QR-Code Auflösung < 200ms
- Scanner-Feedback < 100ms nach Erkennung
- Etiketten-PDF für 100 Artikel < 5s

### PWA-Aspekte (optional, Erweiterung)
- Scanner-Seite als "Add to Home Screen" nutzbar
- Offline-Queue für Buchungen wenn keine Verbindung (localStorage → Sync)

---

## Acceptance Criteria

- [ ] QR-Code-Format definiert: `TERP:ART:{tenantShort}:{articleNumber}`
- [ ] QR-Code wird on-the-fly aus Artikel-Daten generiert (keine DB-Speicherung)
- [ ] Etiketten-PDF mit konfigurierbarem Raster (min. Avery L4736)
- [ ] Einzel- und Massendruck von Etiketten
- [ ] HTML5 Camera Scanner funktioniert auf iOS Safari und Android Chrome
- [ ] Manuelle Eingabe als Fallback wenn keine Kamera verfügbar
- [ ] Wareneingang via Scanner → bestehender WH_04 Service
- [ ] Entnahme via Scanner → bestehender WH_05 Service
- [ ] Inventur via Scanner → bestehender WH_08 Service
- [ ] Storno via Scanner → Stornobuchung im jeweiligen Service
- [ ] Vibrations- und Audio-Feedback bei erfolgreichem Scan
- [ ] Scan-Verlauf (lokale Historie)
- [ ] Mobile-optimiertes UI (Touch-Targets ≥ 48px, responsive)
- [ ] Cross-Tenant QR-Codes werden abgelehnt (Tenant-Validierung)
- [ ] Cross-tenant isolation verified (Tests included)
