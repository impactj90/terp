# AUDIT-002 — Stored XSS in `footerHtml` sanitizen

| Field               | Value                                                         |
| ------------------- | ------------------------------------------------------------- |
| **Priority**        | P1                                                            |
| **Category**        | 6. Input-Validation + Injection                               |
| **Severity**        | HIGH                                                          |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-002)                           |
| **Estimated Scope** | 1 Service, 1 Router, 1 Component (+ optional shared utility)  |

---

## Problem

`BillingTenantConfig.footerHtml` wird als rohes HTML persistiert und per `dangerouslySetInnerHTML` in jede Rechnungs-Vorschau gerendert. Ein Tenant-User mit `billing_documents.edit`-Permission (z.B. Buchhalter) kann damit JavaScript in den Browser jedes Tenant-Users injizieren, der eine Rechnung öffnet oder als PDF rendert — inklusive Admins mit mehr Rechten. Typische Payloads (`<img src=x onerror>`, `<svg onload>`) exfiltrieren Session-Cookies, tRPC-CSRF-Token oder triggern stille Mutationen im Namen des Opfers. Da Billing-Admins häufig nur Subsets der Tenant-Rechte haben, ist das eine echte Privilege-Escalation.

## Root Cause

Zwei unabhängige Lücken auf demselben Feld:

```ts
// ❌ src/trpc/routers/billing/tenantConfig.ts:29
footerHtml: z.string().max(10000).nullable().optional(),
// → Nur Längen-Check, keine HTML-Sanitization
```

```tsx
// ❌ src/components/billing/document-editor.tsx:662
{tenantConfig?.footerHtml ? (
  <div
    className="text-[7pt] text-gray-500"
    dangerouslySetInnerHTML={{ __html: tenantConfig.footerHtml }}
  />
) : ... }
// → Unsanitiertes Rendering
```

## Required Fix

Defense-in-Depth: sanitize beim Write **UND** beim Render.

```ts
// ✅ src/lib/sanitize/html.ts (neu)
import DOMPurify from "isomorphic-dompurify"

const ALLOWED_TAGS = ["br", "b", "i", "em", "strong", "span", "p", "a"]
const ALLOWED_ATTR = ["href", "class"] // href nur http(s)/mailto prüfen

export function sanitizeFooterHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(https?:|mailto:)/i,
  })
}
```

```ts
// ✅ src/trpc/routers/billing/tenantConfig.ts:29
footerHtml: z
  .string()
  .max(10000)
  .transform(sanitizeFooterHtml)
  .nullable()
  .optional(),
```

```tsx
// ✅ src/components/billing/document-editor.tsx:662
// Render zusätzlich mit defensivem Sanitize, falls Altdaten aus DB kommen
dangerouslySetInnerHTML={{ __html: sanitizeFooterHtml(tenantConfig.footerHtml) }}
```

## Affected Files

| File                                                 | Line(s)  | Specific Issue                                         |
| ---------------------------------------------------- | -------- | ------------------------------------------------------ |
| `src/trpc/routers/billing/tenantConfig.ts`           | 29       | Zod-Schema akzeptiert rohes HTML ohne Sanitization     |
| `src/lib/services/billing-tenant-config-service.ts`  | —        | Schreibt `footerHtml` ungefiltert in DB                |
| `src/components/billing/document-editor.tsx`         | 659-663  | `dangerouslySetInnerHTML` mit unsanitiertem Wert       |
| `src/lib/sanitize/html.ts` (NEU)                     | —        | Gemeinsamer Sanitizer fehlt im Repo                    |

## Verification

### Automated

- [ ] Neuer Unit-Test: `sanitizeFooterHtml("<script>alert(1)</script><b>ok</b>")` → `"<b>ok</b>"`
- [ ] Neuer Unit-Test: `sanitizeFooterHtml("<img src=x onerror=alert(1)>")` → `""` oder leere `<img>`
- [ ] Integrations-Test: tRPC-Mutation `billingTenantConfig.upsert` mit XSS-Payload persistiert sanitierten Wert
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Als Tenant-Admin unter `/billing/settings` in `footerHtml` folgenden Payload einfügen: `<img src=x onerror="alert('XSS')">` → Speichern → Rechnung öffnen → Alert feuert NICHT
- [ ] Legitime Footer-Inhalte (Firmenanschrift in `<br>`-getrennten Zeilen) funktionieren weiterhin
- [ ] Vorhandene DB-Einträge mit evtl. bereits vorhandenen "gefährlichen" Tags werden beim Render neutralisiert

## What NOT to Change

- Tiptap-gerenderte Felder in anderen Modulen (CRM-Notes, Employee-Messages) — separate Evaluation, nicht Teil dieses Tickets
- Die restlichen Felder in `upsertInput` — nur `footerHtml` betrifft `dangerouslySetInnerHTML`
- Server-side PDF-Rendering-Pfad, falls vorhanden (PDF-Renderer sanitizen typischerweise selbst; reicht der neue Sanitizer beim Write)

## Notes for Implementation Agent

- Vor Library-Installation prüfen, ob `isomorphic-dompurify` oder `dompurify` bereits in `package.json` liegen. Falls ja, bestehenden Import-Pfad verwenden, NICHT neue Version installieren.
- Der Sanitizer muss **sowohl client- als auch serverseitig** laufen (Zod-Transform läuft im Next.js-Server, Render läuft im Browser). `isomorphic-dompurify` deckt beides ab.
- Falls im Code-Basis bereits ein Sanitizer existiert (grep nach `DOMPurify`, `sanitize`), dessen Konventionen übernehmen statt eines neuen Pattern.
- Die Whitelist `ALLOWED_TAGS` minimal halten — keine `<style>`, kein `<iframe>`, kein `<object>`, keine `on*`-Attribute. Typische Footer brauchen nur Breaks, Bold, Italic, ggf. Link.
- Bei der URI-Regex `^(https?:|mailto:)` bleiben `javascript:`-Links geblockt — wichtig für Defense-in-Depth in `<a href>`.
- Audit-Log-Integration: unverändert — die bestehende `update`-Audit in `billing-tenant-config-service` zeichnet automatisch die sanitierte Version auf. Kein Logging der Roh-Payload nötig (kein Privacy-/Storage-Impact).
