---
topic: Vollwertiger First-Login-Wizard für Starter-Tenants
status: backlog
source_plan: thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md
flag: FLAG 7 (Scope-Cut in Phase 8)
---

# SMTP Multi-Step First-Login-Onboarding-Wizard

## Problem

Der Starter-Flow (Phase 7 des Tenant-Template-Plans) legt einen
produktiven Tenant an, aber SMTP-Credentials kann kein Template seeden.
Der heutige Fix (Phase 8) ist minimal: ein persistenter Hinweis-Banner
im Dashboard-Layout und Send-Buttons, die via `canSend`-Check
deaktiviert sind. Das bringt Admins zum SMTP-Settings-Formular, wenn
sie den Banner sehen.

Was fehlt:

1. Ein aktiver Wizard, der beim ERSTEN Login eines Admins in einem
   Starter-Tenant erscheint und step-by-step durch die Mindestkonfi-
   guration führt (Willkommen → SMTP → Test-Mail → Fertig).
2. Später optional: Template-Review (EmailTemplates + ReminderTemplates
   checken), Logo-Upload, ImageBrandingKit.
3. Erkennung, ob der Tenant ein "frischer Starter" ist (z.B.
   `tenants.first_login_completed_at IS NULL` + `created_from_template_key
   IS NOT NULL`).

## Lösung (Draft)

- Neue Spalte `tenants.first_login_completed_at` (nullable)
- Neue Spalte `tenants.created_from_template_key` (nullable, bereits heute
  implizit via Platform-Audit-Log verfügbar)
- Neuer Tenant-Layout-Gate `TenantOnboardingGate`, der bei frischem
  Tenant + Admin-User den Wizard rendert
- Wizard-Komponente mit Stepper (SMTP, Test-Mail, Company-Logo, Done)
- Abschluss-Mutation setzt `first_login_completed_at = now()`

## Akzeptanzkriterien

- [ ] Neuer Starter-Tenant → Admin-Login → Wizard erscheint
- [ ] Wizard kann übersprungen werden ("Später erledigen"), dann verschwindet
      der Wizard-Gate, Banner bleibt
- [ ] Wizard ist re-entrant: wird nie ohne expliziten Button-Click erneut
      gezeigt
- [ ] Bestehende Tenants (Pre-Phase-7) sehen den Wizard nicht

## Referenzen

- Plan: `thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md` (Phase 8, FLAG 7)
- Heutiger Banner: `src/components/layout/smtp-config-warning-banner.tsx`
