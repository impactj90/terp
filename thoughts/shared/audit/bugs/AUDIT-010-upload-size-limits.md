# AUDIT-010 — Upload-Size-Limits in Supabase-Storage-Helper

| Field               | Value                                         |
| ------------------- | --------------------------------------------- |
| **Priority**        | P2                                            |
| **Category**        | 6. Input-Validation                            |
| **Severity**        | MEDIUM                                        |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-010)            |
| **Estimated Scope** | 1 Helper + 5+ Caller                           |

---

## Problem

Der zentrale `upload()`-Helper in `src/lib/supabase/storage.ts` und alle Konsumenten (Bank-Statement-Import, Inbound-Invoice-Upload, Warenwirtschafts-Bilder, Mahnbescheid-PDF, generierte Rechnungs-PDFs) prüfen keine Größenlimits. Ein Tenant-User mit Upload-Permission kann beliebig große Dateien hochladen — Supabase-Storage-Defaults sind großzügig (50 MB Free-Tier, in Business-Plänen höher). Das öffnet zwei Probleme: (a) DoS via Storage-Quota-Verbrennung und Kosten-Blowup, (b) XML-Parser (CAMT, ZUGFeRD) bekommen die Datei im RAM und können bei riesigen oder Billion-Laughs-artigen Dokumenten das Node-Prozess-Memory sprengen.

## Root Cause

Kein Size-Check vor `.upload(...)`:

```ts
// ❌ src/lib/supabase/storage.ts (~L85-101)
export async function upload(bucket: string, path: string, body: Buffer, options?: {...}) {
  const client = getClient()
  // ⚠️ Keine body.length-Prüfung, keine Konfigurierbarkeit
  return client.storage.from(bucket).upload(path, body, options)
}
```

Keiner der Caller wrappt die Prüfung selbst.

## Required Fix

Pro Bucket konfigurierbare Größe im Helper + Default-Cap:

```ts
// ✅ src/lib/supabase/storage.ts
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024  // 10 MB
const BUCKET_LIMITS: Record<string, number> = {
  "bank-statements": 5 * 1024 * 1024,
  "inbound-invoices": 20 * 1024 * 1024,
  "wh-article-images": 5 * 1024 * 1024,
  "billing-documents": 10 * 1024 * 1024,
  "reminder-pdfs": 5 * 1024 * 1024,
}

export class UploadTooLargeError extends Error {
  constructor(public bucket: string, public bytes: number, public limit: number) {
    super(`Upload for ${bucket} is ${bytes} bytes, limit is ${limit}`)
    this.name = "UploadTooLargeError"
  }
}

export async function upload(bucket: string, path: string, body: Buffer | Uint8Array, options?: {...}) {
  const limit = BUCKET_LIMITS[bucket] ?? DEFAULT_MAX_BYTES
  const size = body.byteLength
  if (size > limit) throw new UploadTooLargeError(bucket, size, limit)
  const client = getClient()
  return client.storage.from(bucket).upload(path, body, options)
}
```

Caller müssen zusätzlich **vor** der Deserialisierung (z.B. base64-decode bei Bank-Statements) die Raw-Byte-Länge prüfen, um Memory-Angriffe zu verhindern.

## Affected Files

| File                                                     | Line(s) | Specific Issue                                    |
| -------------------------------------------------------- | ------- | ------------------------------------------------- |
| `src/lib/supabase/storage.ts`                            | 85-101  | `upload()` ohne Size-Check                        |
| `src/lib/services/bank-statement-service.ts`             | 87      | Caller — zusätzlich base64-Decode-Cap             |
| `src/lib/services/inbound-invoice-service.ts`            | 96      | Caller — ggf. Multer/Form-Data-Size vorab prüfen  |
| `src/lib/services/wh-article-image-service.ts`           | —       | Caller — Image-Resize in Sharp ist Memory-Consumer |
| `src/lib/services/reminder-pdf-service.ts`               | —       | Caller — vom Server generiert, weniger kritisch   |
| `src/lib/services/billing-document-pdf-service.ts`       | —       | Caller — vom Server generiert, weniger kritisch   |
| `src/lib/services/__tests__/supabase-storage.test.ts` (NEU) | —    | Test fehlt                                        |

## Verification

### Automated

- [ ] Unit-Test: `upload("bank-statements", ..., Buffer.alloc(10 * 1024 * 1024))` wirft `UploadTooLargeError`
- [ ] Unit-Test: `upload("inbound-invoices", ..., Buffer.alloc(5 * 1024 * 1024))` erfolgreich (unter Limit)
- [ ] Integrations-Test: Bank-Statement-Import mit 50MB-CAMT → `TRPCError PAYLOAD_TOO_LARGE`
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Über `/billing/bank-statements/import` 20 MB-File hochladen → UI-Fehler "Datei zu groß"
- [ ] Legitimes 500 KB-CAMT wird weiterhin akzeptiert
- [ ] Sharp-Resize für normale Produkt-Bilder (<2 MB) unverändert

## What NOT to Change

- Supabase-seitige Bucket-Storage-Policy (RLS) — separates Baustelle
- Generierte PDFs aus Server-Render — die sind per Definition kleiner als der Cap
- MIME-Type-Validation — separates Baustelle (derzeit hardcoded, Audit nicht beanstandet)
- Client-Side-Size-Check in React-Formularen — bleibt zur UX

## Notes for Implementation Agent

- Die Limits im Pattern `Record<string, number>` sind bewusst hartkodiert — nicht sofort in Env oder DB auslagern (YAGNI). Separates Ticket, wenn Tenants unterschiedliche Limits brauchen.
- In Callern: Wenn der Content als base64-String vom Client kommt, die Länge VOR dem Decode checken (`base64Length * 0.75 ≈ realBytes`). Alternativ: Next.js `bodyParser`-Config in den tRPC-Endpoints — grep nach `sizeLimit` in `src/app/api/trpc/**/route.ts`.
- Sharp (`wh-article-image-service`) sollte zusätzlich `limitInputPixels` setzen, um Pixel-Bomb-Payloads abzufangen. Grep nach `sharp(`, Option ergänzen.
- Fehlerklasse `UploadTooLargeError` muss im `handleServiceError`-Mapper (`src/trpc/errors.ts`) auf `PAYLOAD_TOO_LARGE` gemappt werden — ggf. neue Mapping-Regel ergänzen.
- Bei Tests NICHT echt gegen Supabase uploaden; Storage-Client per Mock ersetzen oder in-memory-Fake verwenden — das Repo hat vermutlich bereits ein Pattern dafür; grep nach `storage.from` im Test-Code.
