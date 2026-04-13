# Platform Billing-Exempt Tenants Implementation Plan

## Overview

Führt ein `billing_exempt`-Flag auf `tenants` ein, das Platform-Operatoren
beim Anlegen oder Bearbeiten eines Tenants setzen können. Exempte Tenants
(z. B. Vertriebspartner, Sonderkunden) können Module buchen und werden im
Operator-CRM als Adresse geführt, erzeugen aber keinerlei
`platform_subscriptions` / `BillingRecurringInvoice` / Rechnungen.

Das bestehende `PLATFORM_OPERATOR_TENANT_ID`-Konzept bleibt unangetastet:
Der Operator-Tenant ist weiterhin der einzige Invoice-Issuer und ist
implizit exempt (Self-Bill-Guard). Das neue Flag ist ein *orthogonales*
Konzept für „Kunden, die wir kennen, aber nicht berechnen wollen".

## Current State Analysis

### Wie die Abo-Erstellung heute läuft

- `subscriptionService.isOperatorTenant(tenantId)`
  (`src/lib/platform/subscription-service.ts:89`) — synchroner
  ENV-Vergleich gegen `PLATFORM_OPERATOR_TENANT_ID`.
- `subscriptionService.createSubscription`
  (`src/lib/platform/subscription-service.ts:346`) — Transaktion, die
  a) CrmAddress im Operator-Tenant find-or-created, b) `PlatformSubscription`-Row
  anlegt, c) `BillingRecurringInvoice` erstellt oder joint. Wirft
  `PlatformSubscriptionSelfBillError`, wenn `customerTenantId` der
  Operator ist.
- `tenantManagement.enableModule`
  (`src/trpc/platform/routers/tenantManagement.ts:524`) — upsertet
  `tenant_modules`, prüft `isSubscriptionBillingEnabled() && !isHouseTenant`
  und ruft dann `createSubscription`.
- `tenantManagement.disableModule`
  (`src/trpc/platform/routers/tenantManagement.ts:619`) — Spiegelbild,
  ruft `cancelSubscription`.
- `demoTenantManagement.convert`
  (`src/trpc/platform/routers/demoTenantManagement.ts:260`) — nach dem
  Konvertieren eines Demos legt pro Modul eine Subscription an, mit
  demselben `isHouseTenant`-Skip.

### Tenant-Row heute

`prisma/schema.prisma:95` hat `Tenant` mit `isActive`, `isDemo`,
`demoExpiresAt`, aber kein Billing-Flag. Das Create-Router-Input in
`tenantManagement.create:135` kennt keine Billing-Semantik; die
Einstellungs-Update-Route akzeptiert nur `name` und `contactEmail`.

### UI heute

- `src/app/platform/(authed)/tenants/new/page.tsx` — einfaches Formular
  ohne Billing-Optionen.
- `src/app/platform/(authed)/tenants/[id]/page.tsx:185` — Badge für
  Demo-Tenants im Übersichts-Card; Einstellungs-Tab mit Inline-Edit für
  `name` und `contactEmail`.
- `src/app/platform/(authed)/tenants/[id]/modules/page.tsx` — Modul-Liste
  mit Enable/Disable, zeigt bei gebuchten Modulen das Abo.

### Key Constraints

- Die Service-Layer darf nicht aus dem Router heraus für Tenants schreiben
  (Multi-Tenancy-Regel aus `CLAUDE.md`): `createSubscription` / `cancelSubscription`
  bleiben die einzigen Einstiegspunkte für Subscription-Schreibzugriffe.
- Hidden Terp-Modelle (BillingRecurringInvoice etc.) dürfen nur via
  Platform-Service-Schicht berührt werden — keine direkten Prisma-Writes
  aus dem Platform-Router in Terp-Tabellen.
- Audit-Regel (`CLAUDE.md` Phase 10b): Jede Platform-Operator-Aktion
  schreibt genau eine Zeile in `platform_audit_logs`, keine Zeile in
  tenant-side `audit_logs` (abgesehen von transitiven System-User-Writes
  aus Tenant-Services).

## Desired End State

Nach diesem Plan:

1. `tenants.billing_exempt BOOLEAN NOT NULL DEFAULT false` existiert und
   ist in `schema.prisma` und im Prisma-Client verfügbar.
2. Beim Anlegen eines neuen Tenants im Platform-Admin UI kann der Operator
   die Checkbox „Automatische Fakturierung" deaktivieren → Tenant wird
   mit `billingExempt=true` angelegt.
3. Im Tenant-Detail unter „Einstellungen" kann das Flag über einen Toggle
   mit Bestätigungsdialog umgeschaltet werden. Jeder Toggle schreibt
   eine `platform_audit_logs`-Zeile mit `action="tenant.billing_exempt_changed"`
   und einem Pflicht-Grund-Text.
4. Beim Modul-Enable für einen exempten Tenant:
   - `tenant_modules`-Upsert läuft normal.
   - `findOrCreateOperatorCrmAddress` wird gerufen → CRM-Adresse
     entsteht beim ersten Modul.
   - `createSubscription` wird NICHT gerufen.
   - `platform_audit_logs.metadata.billingExempt = true` und
     `subscriptionId = null`.
5. Beim Modul-Disable für einen exempten Tenant: `tenant_modules`-Delete
   läuft, `cancelSubscription` wird übersprungen.
6. Beim Demo-Convert mit `billingExempt=true` wird der Subscription-Bridge-
   Block übersprungen, Modul-Re-Enable + CrmAddress-Anlage laufen normal.
7. `createSubscription` im Service wirft zusätzlich
   `PlatformSubscriptionBillingExemptError`, wenn der Customer exempt
   ist — Defense-in-Depth für den Fall, dass ein Caller den Check vergisst.
8. Das Tenant-Detail-Übersichts-Card zeigt ein „Nicht fakturierbar"-Badge
   neben dem Demo-Badge, die Modul-Liste zeigt oben einen Hinweisbanner.

### Verifizierung des End-States

- `supabase db reset` läuft sauber durch und erzeugt die neue Spalte.
- `pnpm db:generate` produziert einen Client mit `Tenant.billingExempt`.
- `pnpm typecheck` ist grün.
- Neue Unit- und Router-Tests grün.
- Manuell:
  1. Neuen Tenant anlegen, Checkbox aus → Tenant in DB hat `billing_exempt=true`.
  2. Modul für diesen Tenant booken → `tenant_modules`-Row existiert,
     `crm_addresses`-Row im Operator-Tenant existiert, keine Zeilen in
     `platform_subscriptions` und `billing_recurring_invoices`.
  3. Flag im Detail-Tab toggeln, Grund eingeben → Audit-Log zeigt
     die Änderung.

### Key Discoveries

- `isOperatorTenant()` ist ein reiner ENV-Check (keine DB-Query) — das
  neue Flag erfordert eine DB-Lookup, der aber in allen betroffenen
  Routern ohnehin schon passiert (`findUnique` vorab, siehe z. B.
  `tenantManagement.ts:534`).
- `findOrCreateOperatorCrmAddress` ist bereits exportiert und idempotent
  — ideal für den Aufruf aus dem exempt-Pfad.
- `computeChanges`-Helper in `tenantManagement.ts:41` liefert das
  Diff-Format, das die bestehenden Update-Audit-Logs verwenden — wir
  wiederverwenden es.
- Das Platform-Audit-Service unterstützt `metadata`, `changes` und
  eigene `action`-Strings (`src/lib/platform/audit-service.ts`).

## What We're NOT Doing

- **Retroaktive Auto-Kündigung**: Wenn ein bestehender Tenant auf
  exempt geschaltet wird, bleiben aktive `platform_subscriptions`
  unberührt. Operator muss sie manuell kündigen (Module aus-/einschalten).
  Ein automatisches Bulk-Cancel ist geldrelevant und bleibt explizit
  manuell. Der Bestätigungsdialog warnt darauf hin.
- **Retroaktive Auto-Reaktivierung**: exempt → fakturierbar erzeugt
  NICHT rückwirkend Abos für bereits aktive Module. Der Operator muss
  die Module kurz aus- und wieder einschalten. Der Bestätigungsdialog
  dokumentiert das.
- **ENV-basierte Multi-Operator-Liste**: Der Operator-Tenant bleibt
  einzigartig (er stellt die Rechnungen aus). Nur die Exempt-Menge ist
  mehrelementig.
- **Read-only UI-Anpassungen außerhalb des Platform-Admins**: Die
  Tenant-interne UI muss nichts vom Flag wissen. Exempte Tenants sehen
  in ihrem eigenen Dashboard keinen Unterschied — sie haben nur einfach
  keine Subscription-Einträge.
- **Validierung, dass exempte Tenants keine Terp-seitigen
  `billing_documents` haben**. Manuelle Rechnungen im Operator-Tenant
  auf die CrmAddress eines Sonderkunden bleiben erlaubt.

## Implementation Approach

Schichtweise von unten nach oben: Schema → Service → Router → UI → Tests.
Jede Phase ist isoliert testbar.

---

## Phase 1: Schema-Migration & Prisma-Client

### Overview
Neue Spalte `billing_exempt` auf `tenants`, Backfill mit `false`,
Prisma-Schema-Update, Client-Regen.

### Changes Required:

#### 1. Migration
**File**: `supabase/migrations/20260423100000_add_tenant_billing_exempt.sql`

```sql
-- Platform Billing-Exempt Tenants: allow marking customers (sales
-- partners, free accounts) as not-automatically-invoiced. Orthogonal
-- to PLATFORM_OPERATOR_TENANT_ID (the operator is always implicitly
-- exempt via the self-bill guard).
ALTER TABLE public.tenants
  ADD COLUMN billing_exempt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.billing_exempt IS
  'True if this tenant is exempt from automatic platform subscription '
  'billing. Module bookings still create tenant_modules rows and a '
  'CrmAddress in the operator tenant, but no platform_subscriptions '
  'or billing_recurring_invoices are generated. Toggle via '
  'platform admin UI; changes are logged to platform_audit_logs '
  'with action "tenant.billing_exempt_changed".';
```

#### 2. Prisma Schema
**File**: `prisma/schema.prisma`
**Changes**: Add field to `Tenant` model (after `vacationBasis`, before
`isDemo`).

```prisma
  vacationBasis String @default("calendar_year") @map("vacation_basis") @db.VarChar(20)

  // Platform billing control (plan 2026-04-13-platform-billing-exempt-tenants.md)
  billingExempt Boolean @default(false) @map("billing_exempt")

  // Demo-Tenant fields (see plan 2026-04-09-demo-tenant-system.md)
  isDemo                      Boolean   @default(false) @map("is_demo")
```

### Success Criteria:

#### Automated Verification:
- [x] Migration gilt sauber: `pnpm db:reset`
- [x] Prisma-Client generiert: `pnpm db:generate`
- [x] Typecheck grün: `pnpm typecheck`

#### Manual Verification:
- [ ] Nach `db:reset` zeigt `psql` die Spalte mit `DEFAULT false`.
- [ ] Bestehende Seed-Tenants haben `billing_exempt=false`.

---

## Phase 2: Service-Layer Defense-in-Depth

### Overview
Neue Error-Klasse + Hardening von `createSubscription`, damit ein
vergessener Caller-Check nicht zu fälschlich erzeugten Rechnungen führt.

### Changes Required:

#### 1. New Error Class
**File**: `src/lib/platform/subscription-service.ts`
**Changes**: Nach `PlatformSubscriptionSelfBillError` (Zeile 57) neue
Klasse hinzufügen.

```ts
/**
 * Refusal error: the customer tenant is billing-exempt. Thrown by
 * createSubscription as defense-in-depth — callers should check the
 * tenant's billingExempt flag first and skip the subscription block
 * entirely. See plan 2026-04-13-platform-billing-exempt-tenants.md.
 */
export class PlatformSubscriptionBillingExemptError extends Error {
  constructor(tenantId: string) {
    super(
      `Refusing to create a subscription for billing-exempt tenant ${tenantId}. ` +
        `Callers must check tenants.billingExempt before invoking createSubscription.`,
    )
    this.name = "PlatformSubscriptionBillingExemptError"
  }
}
```

#### 2. Hardening in `createSubscription`
**File**: `src/lib/platform/subscription-service.ts`
**Changes**: Im `$transaction`-Block vor `findOrCreateOperatorCrmAddress`
einen DB-Lookup des Customer-Tenants und einen Throw einfügen.

```ts
  return await prisma.$transaction(async (tx) => {
    // Defense-in-depth: refuse billing-exempt customers. Callers should
    // filter these out before calling, but we fail loud rather than
    // silently creating phantom subscriptions if the caller drifts.
    const customerTenant = await tx.tenant.findUnique({
      where: { id: input.customerTenantId },
      select: { billingExempt: true },
    })
    if (!customerTenant) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Customer tenant ${input.customerTenantId} not found`,
      })
    }
    if (customerTenant.billingExempt) {
      throw new PlatformSubscriptionBillingExemptError(input.customerTenantId)
    }

    const operatorCrmAddressId = await findOrCreateOperatorCrmAddress(
      tx,
      input.customerTenantId,
    )
    // … rest unchanged
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm vitest run src/lib/platform/__tests__/subscription-service.test.ts`
      inkl. neuem Test-Case grün.
- [x] Typecheck grün: `pnpm typecheck`

#### Manual Verification:
- [ ] Kein manueller Test nötig für diese Phase — rein interne Service-Änderung,
      wird über Phase 3 mitgetestet.

---

## Phase 3: Router-Integration

### Overview
Platform-Router akzeptiert das Flag beim Create, Update, Convert und
respektiert es in enableModule/disableModule.

### Changes Required:

#### 1. `tenantManagement.create` — neues Input-Feld
**File**: `src/trpc/platform/routers/tenantManagement.ts`
**Changes**: Input-Schema und Tenant-Create erweitern.

```ts
  create: platformAuthedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(255),
        slug: z.string().trim().toLowerCase().min(2).max(100).regex(slugPattern, /* ... */),
        contactEmail: z.string().email(),
        initialAdminEmail: z.string().email(),
        initialAdminDisplayName: z.string().trim().min(2).max(255),
        addressStreet: z.string().trim().min(1).max(255),
        addressZip: z.string().trim().min(1).max(20),
        addressCity: z.string().trim().min(1).max(100),
        addressCountry: z.string().trim().min(1).max(100),
        billingExempt: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // … inside tx.tenant.create:
      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          slug: input.slug,
          email: input.contactEmail,
          addressStreet: input.addressStreet,
          addressZip: input.addressZip,
          addressCity: input.addressCity,
          addressCountry: input.addressCountry,
          isActive: true,
          billingExempt: input.billingExempt,
        },
      })
      // … rest unchanged
      // audit metadata:
      metadata: {
        slug: result.tenant.slug,
        initialAdminEmail: input.initialAdminEmail,
        welcomeEmailSent: result.welcomeEmail.sent,
        billingExempt: input.billingExempt,
      },
```

#### 2. `tenantManagement.update` — Flag nicht hier, sondern in neuer Procedure
**File**: `src/trpc/platform/routers/tenantManagement.ts`
**Changes**: Die bestehende `update`-Mutation bleibt unverändert (nur
`name`, `contactEmail`). Stattdessen neue dedizierte Procedure
`setBillingExempt`, weil der Toggle einen Pflicht-Grund erfordert und
den Wert bewusst explizit macht.

```ts
  setBillingExempt: platformAuthedProcedure
    .input(
      z.object({
        id: tenantIdSchema,
        billingExempt: z.boolean(),
        reason: z.string().trim().min(3).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
        select: { id: true, billingExempt: true, name: true },
      })
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" })
      }
      if (existing.billingExempt === input.billingExempt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Das Flag ist bereits auf diesem Wert",
        })
      }

      // Defense: refuse to flip the operator tenant — it is implicitly
      // exempt via the self-bill guard and should never appear in this UI,
      // but we fail loud if the operator ever tries.
      if (subscriptionService.isOperatorTenant(input.id)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Operator-Tenant kann nicht umgeschaltet werden",
        })
      }

      await ctx.prisma.tenant.update({
        where: { id: input.id },
        data: { billingExempt: input.billingExempt },
      })

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "tenant.billing_exempt_changed",
        entityType: "tenant",
        entityId: input.id,
        targetTenantId: input.id,
        changes: {
          billingExempt: {
            old: existing.billingExempt,
            new: input.billingExempt,
          },
        },
        metadata: { reason: input.reason },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })

      return { success: true }
    }),
```

#### 3. `tenantManagement.enableModule` — Exempt-Pfad
**File**: `src/trpc/platform/routers/tenantManagement.ts`
**Changes**: Den ersten SELECT um `billingExempt` erweitern, den
Subscription-Block erweitern.

```ts
      const tenant = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true, billingExempt: true },
      })
      if (!tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" })
      }

      // … tenant_modules upsert unchanged …

      let subscriptionResult:
        | Awaited<ReturnType<typeof subscriptionService.createSubscription>>
        | null = null
      let operatorCrmAddressId: string | null = null
      const isHouseTenant = subscriptionService.isOperatorTenant(input.tenantId)
      const shouldBill =
        subscriptionService.isSubscriptionBillingEnabled() &&
        !isHouseTenant &&
        !tenant.billingExempt

      if (shouldBill) {
        const existing = await ctx.prisma.platformSubscription.findFirst({
          where: {
            tenantId: input.tenantId,
            module: input.moduleKey,
            status: "active",
          },
          select: { id: true },
        })
        if (!existing) {
          subscriptionResult = await subscriptionService.createSubscription(
            ctx.prisma,
            {
              customerTenantId: input.tenantId,
              module: input.moduleKey,
              billingCycle: input.billingCycle,
            },
            ctx.platformUser.id,
          )
          operatorCrmAddressId = subscriptionResult.operatorCrmAddressId
        }
      } else if (
        tenant.billingExempt &&
        subscriptionService.isSubscriptionBillingEnabled() &&
        !isHouseTenant
      ) {
        // Exempt-Pfad: CRM-Adresse im Operator-Tenant anlegen, damit der
        // Kunde im Operator-CRM sichtbar ist, auch wenn keine Abos laufen.
        // findOrCreateOperatorCrmAddress ist idempotent.
        operatorCrmAddressId =
          await subscriptionService.findOrCreateOperatorCrmAddress(
            ctx.prisma,
            input.tenantId,
          )
      }

      await platformAudit.log(ctx.prisma, {
        platformUserId: ctx.platformUser.id,
        action: "module.enabled",
        entityType: "tenant_module",
        entityId: row.id,
        targetTenantId: input.tenantId,
        metadata: {
          moduleKey: input.moduleKey,
          operatorNote: input.operatorNote ?? null,
          billingCycle: input.billingCycle,
          subscriptionId: subscriptionResult?.subscriptionId ?? null,
          billingRecurringInvoiceId:
            subscriptionResult?.billingRecurringInvoiceId ?? null,
          operatorCrmAddressId,
          billingExempt: tenant.billingExempt,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
```

#### 4. `tenantManagement.disableModule` — Exempt-Skip
**File**: `src/trpc/platform/routers/tenantManagement.ts`
**Changes**: Flag mit-laden, Cancel-Block überspringen.

```ts
      // Am Anfang der mutation:
      const tenant = await ctx.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { billingExempt: true },
      })

      // … bestehende row-lookup + delete …

      let cancelledSubscriptionId: string | null = null
      const isHouseTenant = subscriptionService.isOperatorTenant(input.tenantId)
      if (
        subscriptionService.isSubscriptionBillingEnabled() &&
        !isHouseTenant &&
        !tenant?.billingExempt
      ) {
        // … bestehender cancel-Block unverändert …
      }

      // Audit-metadata ergänzen:
      metadata: {
        moduleKey: input.moduleKey,
        reason: input.reason ?? null,
        operatorNote: row.operatorNote,
        cancelledSubscriptionId,
        billingExempt: tenant?.billingExempt ?? false,
      },
```

#### 5. `demoTenantManagement.convert` — Flag-Input + Skip
**File**: `src/trpc/platform/routers/demoTenantManagement.ts`
**Changes**: Input-Schema erweitern, Flag auf Tenant schreiben,
Subscription-Bridge überspringen wenn gesetzt.

```ts
    .input(
      z.object({
        tenantId: tenantIdSchema,
        discardData: z.boolean().default(false),
        billingCycle: z.enum(["MONTHLY", "ANNUALLY"]).default("MONTHLY"),
        billingExempt: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // … bestehender convert-call …

      // Neuer Step 2b: Flag auf Tenant schreiben (nach demoService.convert,
      // vor dem Subscription-Bridge-Block).
      if (input.billingExempt) {
        await ctx.prisma.tenant.update({
          where: { id: input.tenantId },
          data: { billingExempt: true },
        })
      }

      // Step 3: subscription bridge — überspringen wenn exempt
      const isHouseTenant = subscriptionService.isOperatorTenant(input.tenantId)
      if (
        subscriptionService.isSubscriptionBillingEnabled() &&
        !isHouseTenant &&
        !input.billingExempt
      ) {
        // … bestehender Block …
      } else if (input.billingExempt && !isHouseTenant) {
        // Exempt-Pfad: CrmAddress einmalig anlegen, keine Abos.
        try {
          await subscriptionService.findOrCreateOperatorCrmAddress(
            ctx.prisma,
            input.tenantId,
          )
        } catch (err) {
          // Non-fatal — convert ist committed, Operator kann CRM-Adresse
          // manuell nachziehen.
          failedModules.push({
            module: "__crm_address__",
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // Audit-metadata ergänzen:
      metadata: {
        …existing,
        billingExempt: input.billingExempt,
      },
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm vitest run src/trpc/platform/routers/__tests__/tenantManagement.test.ts` grün
- [x] `pnpm vitest run src/trpc/platform/routers/__tests__/demoTenantManagement.test.ts` grün
- [x] `pnpm vitest run src/lib/platform/__tests__/subscription-service.test.ts` grün
- [x] Typecheck grün: `pnpm typecheck`
- [x] Lint grün: `pnpm lint`

#### Manual Verification:
- [ ] Nach Phase 4 (UI) end-to-end getestet.

**Implementation Note**: Nach Phase 3 und grünen Automated-Checks
pausieren und die manuellen Tests erst mit der fertigen UI in Phase 4
durchlaufen.

---

## Phase 4: Platform-Admin UI

### Overview
Checkbox im Anlegen-Formular, Toggle mit Bestätigungsdialog im Detail,
Badge in der Übersicht, Hinweisbanner in der Modul-Liste, Convert-Dialog.

### Changes Required:

#### 1. New-Tenant-Formular
**File**: `src/app/platform/(authed)/tenants/new/page.tsx`
**Changes**: Neue Checkbox am Ende des Formulars (eigene Card
„Abrechnung"), Submit um `billingExempt` erweitern.

```tsx
// neuer useState:
const [billingExempt, setBillingExempt] = useState(false)

// neue Card direkt vor dem Submit-Button:
<Card>
  <CardHeader>
    <CardTitle>Abrechnung</CardTitle>
    <CardDescription>
      Steuert, ob dieser Tenant automatisch fakturiert wird.
    </CardDescription>
  </CardHeader>
  <CardContent>
    <label className="flex items-start gap-3 cursor-pointer">
      <Checkbox
        checked={!billingExempt}
        onCheckedChange={(v) => setBillingExempt(!v)}
        id="billingExempt"
      />
      <div className="space-y-1">
        <div className="font-medium">Automatische Fakturierung</div>
        <p className="text-sm text-muted-foreground">
          Deaktivieren für Vertriebspartner und Sonderkunden, die die
          Applikation nutzen aber nicht bezahlen. CRM-Adresse wird
          trotzdem beim ersten Modul angelegt; es werden aber keine
          automatischen Abos und Rechnungen erzeugt. Manuelle Rechnungen
          auf die CRM-Adresse bleiben jederzeit möglich.
        </p>
      </div>
    </label>
  </CardContent>
</Card>

// im createMutation.mutate-call:
billingExempt,
```

#### 2. Tenant-Detail Übersichts-Badge
**File**: `src/app/platform/(authed)/tenants/[id]/page.tsx`
**Changes**: Badge-Block direkt unterhalb des Demo-Badges (Zeile ~194).

```tsx
{tenant.billingExempt ? (
  <>
    <span className="text-muted-foreground">Fakturierung</span>
    <span>
      <Badge variant="outline" className="border-amber-500 text-amber-700">
        Nicht fakturierbar
      </Badge>
    </span>
  </>
) : null}
```

#### 3. Tenant-Detail Einstellungen — Toggle-Sektion
**File**: `src/app/platform/(authed)/tenants/[id]/page.tsx`
**Changes**: Neue Sektion im „Einstellungen"-Tab unterhalb des bestehenden
Name/Email-Forms. Dedizierter Dialog mit Pflicht-Grund.

```tsx
// neuer useState:
const [exemptDialogOpen, setExemptDialogOpen] = useState(false)
const [exemptReason, setExemptReason] = useState("")

// neue Mutation:
const setExemptMutation = useMutation({
  ...trpc.tenantManagement.setBillingExempt.mutationOptions(),
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: trpc.tenantManagement.getById.queryKey({ id }),
    })
    queryClient.invalidateQueries({
      queryKey: trpc.auditLogs.list.queryKey(),
    })
    toast.success("Fakturierungs-Status aktualisiert")
    setExemptDialogOpen(false)
    setExemptReason("")
  },
  onError: (err) => toast.error(err.message ?? "Umschalten fehlgeschlagen"),
})

// neue Card in TabsContent value="settings":
<Card>
  <CardHeader>
    <CardTitle>Fakturierung</CardTitle>
    <CardDescription>
      {tenant.billingExempt
        ? "Dieser Tenant ist von automatischer Fakturierung ausgenommen. Modul-Buchungen erzeugen keine Abos oder Rechnungen."
        : "Modul-Buchungen auf diesem Tenant erzeugen automatisch Abos und wiederkehrende Rechnungen im Operator-Tenant."}
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Button
      variant={tenant.billingExempt ? "default" : "outline"}
      onClick={() => setExemptDialogOpen(true)}
    >
      {tenant.billingExempt
        ? "Fakturierung aktivieren"
        : "Von Fakturierung ausnehmen"}
    </Button>
  </CardContent>
</Card>

<Dialog open={exemptDialogOpen} onOpenChange={setExemptDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>
        {tenant.billingExempt
          ? "Fakturierung aktivieren?"
          : "Tenant von Fakturierung ausnehmen?"}
      </DialogTitle>
      <DialogDescription>
        {tenant.billingExempt ? (
          <>
            Nach dem Umschalten werden zukünftige Modul-Aktivierungen
            wieder automatisch Abos erzeugen. <strong>Bereits aktive
            Module bekommen KEIN rückwirkendes Abo</strong> — dafür
            müssen die Module einmal deaktiviert und wieder aktiviert
            werden.
          </>
        ) : (
          <>
            Zukünftige Modul-Aktivierungen erzeugen keine Abos mehr.
            <strong> Bestehende aktive Abos werden NICHT automatisch
            gekündigt</strong> — diese müssen im Modul-Bereich manuell
            per Deaktivieren beendet werden.
          </>
        )}
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-2">
      <Label htmlFor="exemptReason">Grund (Audit-Log)</Label>
      <Textarea
        id="exemptReason"
        value={exemptReason}
        onChange={(e) => setExemptReason(e.target.value)}
        placeholder="Z. B. Vertriebspartner lt. Rahmenvertrag vom …"
        required
        minLength={3}
        maxLength={500}
      />
    </div>
    <DialogFooter>
      <Button variant="ghost" onClick={() => setExemptDialogOpen(false)}>
        Abbrechen
      </Button>
      <Button
        onClick={() =>
          setExemptMutation.mutate({
            id: tenant.id,
            billingExempt: !tenant.billingExempt,
            reason: exemptReason.trim(),
          })
        }
        disabled={exemptReason.trim().length < 3 || setExemptMutation.isPending}
      >
        {setExemptMutation.isPending ? "Wird gespeichert…" : "Bestätigen"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### 4. Modul-Seite Hinweisbanner
**File**: `src/app/platform/(authed)/tenants/[id]/modules/page.tsx`
**Changes**: Der tenantQuery (`getById`) wird bereits geladen; Banner
oberhalb der Modul-Tabelle wenn `tenant.billingExempt`.

```tsx
{tenant?.billingExempt ? (
  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
    <strong>Nicht fakturierbar:</strong> Dieser Tenant ist von
    automatischer Fakturierung ausgenommen. Modul-Buchungen legen eine
    CRM-Adresse im Operator-Tenant an, erzeugen aber keine Abos oder
    wiederkehrenden Rechnungen.
  </div>
) : null}
```

#### 5. Demo-Convert-Dialog
**File**: `src/app/platform/(authed)/tenants/demo/page.tsx`
**Changes**: Im Convert-Dialog eine Checkbox hinzufügen, die den
`billingExempt`-Parameter beim `convert.mutate()` mitsendet. Defaultet
auf `false`.

### Success Criteria:

#### Automated Verification:
- [x] Typecheck grün: `pnpm typecheck`
- [x] Lint grün: `pnpm lint`

#### Manual Verification:
- [ ] Neuen Tenant mit deaktivierter „Automatische Fakturierung"-Checkbox
      anlegen → DB-Eintrag `billing_exempt=true`.
- [ ] Auf Tenant-Detail-Seite „Nicht fakturierbar"-Badge sichtbar.
- [ ] Modul `crm` für den exempten Tenant buchen → `tenant_modules`-Row
      existiert, `crm_addresses` im Operator-Tenant hat neuen Eintrag,
      `platform_subscriptions` hat KEINEN neuen Eintrag,
      `billing_recurring_invoices` hat KEINEN neuen Eintrag.
- [ ] `platform_audit_logs`-Zeile für `module.enabled` hat
      `metadata.billingExempt=true` und `subscriptionId=null`.
- [ ] Modul-Seite zeigt den amber Hinweisbanner.
- [ ] Im Einstellungen-Tab auf „Fakturierung aktivieren" klicken, Grund
      leer lassen → Button disabled. Grund eintragen, bestätigen →
      Flag auf `false`, neue Audit-Log-Zeile mit `changes.billingExempt`.
- [ ] Erneutes Modul-Enable eines NEUEN Moduls erzeugt jetzt ein Abo;
      die zuvor aktiven Module haben weiterhin kein Abo (manuelle
      Intervention nötig).
- [ ] Umgekehrt: fakturierbaren Tenant auf exempt umschalten, bestehendes
      Abo bleibt aktiv (kein Auto-Cancel).
- [ ] Demo-Tenant mit `billingExempt=true` konvertieren → keine Abos,
      aber CrmAddress existiert.
- [ ] Operator-Tenant selbst ruft `setBillingExempt` → 400 Error
      „Der Operator-Tenant kann nicht umgeschaltet werden".

**Implementation Note**: Nach Phase 4 pausieren und alle manuellen Checks
durchlaufen, bevor die Test-Phase beginnt.

---

## Phase 5: Tests

### Overview
Unit-/Router-Tests für die neuen Pfade.

### Changes Required:

#### 1. Service-Test
**File**: `src/lib/platform/__tests__/subscription-service.test.ts`
**Changes**: Neue Cases.

```ts
it("createSubscription throws PlatformSubscriptionBillingExemptError for exempt customer", async () => {
  // seed exempt tenant, dann createSubscription rufen, auf Throw prüfen
})
```

#### 2. Router-Tests `tenantManagement`
**File**: `src/trpc/platform/routers/__tests__/tenantManagement.test.ts`
**Changes**: Neue `describe("billing-exempt tenants")` Block.

```ts
describe("billing-exempt tenants", () => {
  it("create accepts billingExempt=true", async () => { /* … */ })
  it("enableModule on exempt tenant creates tenant_module + CrmAddress but no subscription", async () => { /* … */ })
  it("disableModule on exempt tenant skips cancelSubscription", async () => { /* … */ })
  it("setBillingExempt requires reason, writes platform audit with changes diff", async () => { /* … */ })
  it("setBillingExempt rejects operator tenant", async () => { /* … */ })
  it("setBillingExempt rejects no-op toggle", async () => { /* … */ })
})
```

#### 3. Router-Test `demoTenantManagement`
**File**: `src/trpc/platform/routers/__tests__/demoTenantManagement.test.ts`
**Changes**: Convert-Case mit `billingExempt=true`.

```ts
it("convert with billingExempt=true skips subscription bridge but creates CrmAddress", async () => { /* … */ })
```

### Success Criteria:

#### Automated Verification:
- [x] Alle neuen Testfälle grün
- [x] `pnpm test` gesamt grün (keine Regressionen)
- [x] Typecheck grün: `pnpm typecheck`
- [x] Lint grün: `pnpm lint`

#### Manual Verification:
- [ ] Test-Output review — keine übersprungenen Fälle, keine
      unerwarteten Warnings.

---

## Testing Strategy

### Unit Tests:
- `createSubscription` mit exempt-Customer wirft neuen Error
- `setBillingExempt` rejects wenn `old===new`
- `setBillingExempt` rejects für Operator-Tenant

### Router-Tests:
- `enableModule` exempt-Pfad: Modul-Row + CrmAddress, keine Subscription
- `enableModule` normaler Pfad: unverändert, keine Regression
- `disableModule` exempt-Pfad: kein `cancelSubscription`-Call
- `create` mit `billingExempt=true`: Flag in DB, Audit-Metadata gesetzt
- `setBillingExempt` toggle: Audit-Changes korrekt, Grund im `metadata.reason`
- `convert` mit `billingExempt=true`: Flag geschrieben, Bridge skipped,
  CrmAddress angelegt

### Manual Testing Steps:
Siehe Manual-Verification-Blocks in den Phasen 1 und 4.

## Migration Notes

- Bestehende Tenants bekommen `billing_exempt=false` per Column-Default.
  Keine Daten-Backfill-Logik nötig.
- Ein bereits aktiver Operator-Tenant bleibt implizit exempt über
  `PLATFORM_OPERATOR_TENANT_ID`; das neue DB-Flag auf dem Operator wird
  nie gesetzt, und `setBillingExempt` lehnt ihn explizit ab.

## References

- Current operator guard: `src/lib/platform/subscription-service.ts:89`
  (`isOperatorTenant`), `:346` (`createSubscription` mit Self-Bill-Guard)
- Current enable/disable-Skip: `src/trpc/platform/routers/tenantManagement.ts:575`
  und `:658`
- Current convert-Bridge: `src/trpc/platform/routers/demoTenantManagement.ts:260`
- Demo-Tenant-Migration als Vorlage für Tenant-Column-Extension:
  `supabase/migrations/20260420100000_add_tenant_demo_fields.sql`
- Related plan: `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md`
  (Phase 10a — definiert die bestehende Abo-Bridge)
