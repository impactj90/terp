---
topic: emailTemplateService.seedDefaults tx-safe machen
status: backlog
source_plan: thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md
flag: FLAG 11 (Plan)
---

# emailTemplateService.seedDefaults: tx-safe machen

## Problem

`seedUniversalDefaults` (`src/lib/tenant-templates/seed-universal-defaults.ts`)
kann `emailTemplateService.seedDefaults(prisma, tenantId)` NICHT aus
einem `Prisma.TransactionClient` aufrufen, weil:

- `emailTemplateService.seedDefaults` (`email-template-service.ts:159`)
  iteriert alle DocTypes und ruft für jeden
  `emailTemplateRepository.create(prisma, tenantId, { …, isDefault: true })`.
- `emailTemplateRepository.create` (`email-template-repository.ts:50`)
  öffnet beim Pfad `isDefault=true` intern eine neue
  `prisma.$transaction(...)`.
- `Prisma.TransactionClient` hat zur Laufzeit **kein** `$transaction` —
  der Aufruf wirft `TypeError: prisma.$transaction is not a function`.

Als Workaround seedet `seedUniversalDefaults` die 8 Default-
EmailTemplates **inline** auf `ctx.tx.emailTemplate.create(...)`. Die
Content-Source ist weiterhin `src/lib/email/default-templates.ts` —
keine Duplikation von Subject/Body-Text, aber der Persistenz-Pfad ist
dupliziert.

## Lösung (Draft)

1. `emailTemplateRepository.create` umbauen: statt einer **neuen**
   `prisma.$transaction`, akzeptiert die Funktion einen optionalen
   `tx`-Parameter. Wenn gesetzt, läuft der "unset previous default"-
   Teil **inline** im selben `tx`. Die äußere Transaktion kommt vom
   Aufrufer.
2. `emailTemplateService.seedDefaults` kann dann mit einem
   `TransactionClient` aufgerufen werden.
3. `seedUniversalDefaults` zurückbauen: statt inline-Seed einfach
   `emailTemplateService.seedDefaults(tx, tenantId)` aufrufen.

## Akzeptanzkriterien

- [ ] `emailTemplateRepository.create(tx, tenantId, input)` läuft ohne
      nested `$transaction`
- [ ] `emailTemplateService.seedDefaults` akzeptiert `Prisma.TransactionClient`
- [ ] `seed-universal-defaults.ts` ruft den Service-Aggregator statt
      Inline-Seed
- [ ] Bestehende `email-template-service.test.ts` bleibt grün
- [ ] Bestehender `createFromTemplate`-Integration-Test bleibt grün

## Referenzen

- Plan: `thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md` (FLAG 11, Phase 4 Trade-off)
- Inline-Workaround: `src/lib/tenant-templates/seed-universal-defaults.ts`
- Blocker-Files: `src/lib/services/email-template-repository.ts:50`,
  `src/lib/services/email-template-service.ts:181`
