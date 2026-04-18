# Security Audit Report — 2026-04-17

## Summary

- Kritisch: 0 | Hoch: 3 | Mittel: 8 | Niedrig: 4 | Informativ: 3
- Top 3 Sofortmaßnahmen: **SEC-001** (Recovery-Code-Race), **SEC-002** (Stored-XSS footerHtml), **SEC-003** (TOTP-Enrollment-Token)
- Scope: `src/lib/services/**`, `src/trpc/routers/**`, `src/trpc/platform/**`, `src/app/api/**`, `src/lib/platform/**`
- Methodik: Quellen-Review (keine Runtime-Analyse, keine `npm audit`, kein 3rd-party-Pentest)

## Findings

### SEC-001 — Recovery-Code Consumption ist nicht atomar

- **Severity:** Hoch
- **Block:** 3 (Auth + Session)
- **Ort:** `src/lib/platform/login-service.ts:312-380`, Write-Pfad via `finishSuccessfulLogin` → `prisma.platformUser.update` in `src/lib/platform/login-service.ts:164-171`
- **Beobachtung:** `mfaVerifyStep` liest `user.recoveryCodes` (L360), ruft `consumeRecoveryCode(storedHashes, input.recoveryCode!)` (L361) — rein in-memory — und persistiert das gekürzte Array per `finishSuccessfulLogin(..., { recoveryCodes: consume.remaining })` (L371-379). Zwischen Read und Write liegt kein `SELECT ... FOR UPDATE`, keine Prisma-Transaktion, kein Optimistic-Locking.
- **Angriffsszenario:** Angreifer besitzt EINEN gültigen Recovery-Code (z.B. via Phishing des One-Time-Anzeige-Screens nach MFA-Enrollment). Er startet zwei parallele Requests an `mfaVerifyStep` mit demselben Code. Beide lesen `recoveryCodes = [hashX, …]`, beide produzieren identische `remaining`, beide rufen `finishSuccessfulLogin` auf → beide erhalten JWT-Session. Damit ist der einmalige Code effektiv zwei Sessions wert. Bei N paralleler Anfragen potenziell N Sessions (Write-Win ist idempotent, Read-Phase ist race-anfällig).
- **Impact:** Kompromittiertes Platform-Admin-Konto → Zugriff auf alle Tenants über Impersonation; ein abgefangener Recovery-Code öffnet nicht nur eine, sondern mehrere Sessions bevor er sich "verbraucht".
- **Empfohlene Richtung:** `prisma.$transaction` mit `SELECT ... FOR UPDATE` auf `platform_users`-Zeile, oder Code-Hashes in separate Tabelle mit `deleteMany({ where: { hash, usedAt: null } })` als atomarem Konsum.
- **Verifikation:** Integration-Test der 20 parallele `mfaVerifyStep`-Aufrufe mit demselben Recovery-Code startet → erwartet: 1 Erfolg, 19 Failures. Aktuell: mehrere Erfolge möglich.

### SEC-002 — Stored XSS über `tenantConfig.footerHtml` (dangerouslySetInnerHTML)

- **Severity:** Hoch
- **Block:** 6 (Input-Validation)
- **Ort:** `src/components/billing/document-editor.tsx:662` (Rendering), `src/trpc/routers/billing/tenantConfig.ts:29` (Schema), `src/lib/services/billing-tenant-config-service.ts` (Persistenz)
- **Beobachtung:** `footerHtml` wird als `z.string().max(10000)` akzeptiert — keine Sanitization, kein DOMPurify, kein Whitelist-Tag-Filter. In `document-editor.tsx:659-663` wird das Feld ungefiltert via `dangerouslySetInnerHTML={{ __html: tenantConfig.footerHtml }}` in jede Rechnungsvorschau gerendert. Schreibberechtigung: `billing_documents.edit`.
- **Angriffsszenario:** Angreifer mit `billing_documents.edit`-Permission (z.B. kompromittierter Buchhalter, Insider) speichert `<img src=x onerror="fetch('/api/trpc/...')">` in `footerHtml`. Jeder Tenant-Benutzer, der eine Rechnung im Editor oder Preview öffnet, führt den Payload im eigenen Browser-Kontext aus. Ziel: Session-Klau via `document.cookie`, CSRF-Token-Exfil, oder Weiterleitung zu Phishing.
- **Impact:** Privilege-Escalation tenant-intern: Buchhalter (BILLING_EDIT) → beliebiger Tenant-User (möglicherweise Admin beim Preview). Keine Cross-Tenant-Grenze verletzt, aber intra-Tenant XSS ist im Billing-Modul besonders schwerwiegend, weil Admins Rechnungen häufig reviewen.
- **Empfohlene Richtung:** DOMPurify server-seitig vor dem Persistieren, oder Tag-Whitelist (nur `<br>`, `<span>`, `<b>`, `<i>` ohne `on*`-Attribute). Oder: Plain-Text-Feld mit renderseitigem Line-Break-Escape.
- **Verifikation:** Via tRPC-Call `billingTenantConfig.upsert` mit `footerHtml: "<img src=x onerror=alert(1)>"` speichern, Rechnung öffnen → Alert feuert.

### SEC-003 — TOTP-Enrollment-Token trägt Secret im Plaintext-JWT und ist nicht session-gebunden

- **Severity:** Hoch
- **Block:** 3 (Auth + Session)
- **Ort:** `src/lib/platform/jwt.ts:109-137` (Claims + Signer), `src/lib/platform/login-service.ts:221-247` (Ausgabe), `src/lib/platform/login-service.ts:251-308` (Konsum)
- **Beobachtung:** Nach erfolgreicher Passwort-Prüfung für einen noch nicht enrolled Platform-User gibt `passwordStep` ein `signMfaEnrollmentToken({ sub, email, displayName, secretBase32 })` mit 5min-TTL zurück. Der JWT ist signiert, aber **nicht verschlüsselt** — `secretBase32` ist base64-lesbar. Enrollment ist dann reiner Besitznachweis des Tokens + eines gültigen TOTP-Codes zum enthaltenen Secret. Kein IP-Binding, keine Session-Cookie-Bindung, keine Single-Use-Markierung in der DB.
- **Angriffsszenario:** Angreifer kennt Passwort (Phishing, Password-Reuse, Bootstrap-Leak), muss aber MFA nicht umgehen — er muss nur MFA als ERSTER enrollen. Er führt `passwordStep` aus, liest den Enrollment-Token aus der Antwort, dekodiert den JWT-Body (`atob(split('.')[1])`), extrahiert `secretBase32`, berechnet `firstToken`, ruft `mfaEnrollStep` auf. Der legitime User findet ab jetzt beim Enrollment `user.mfaEnrolledAt != null` → `InvalidCredentialsError` (L275-277). Angreifer hält das MFA-Secret. In der Bootstrap-Phase (neues Platform-Deployment, Owner hat Passwort, hat aber noch nicht enrolled) ist das ein Race.
- **Impact:** Vollständige Übernahme des Platform-Admin-Kontos vor dessen Erstlogin. Cross-Tenant-Impact via Impersonation.
- **Empfohlene Richtung:** Secret nicht im Token transportieren, sondern in DB-Spalte `platform_users.pending_mfa_secret` (encrypted) + `pending_mfa_token_hash` ablegen. Token = nur die gehashte Referenz. Optional: IP-Bindung oder zusätzlicher MFA-Intent-Cookie.
- **Verifikation:** Bootstrap einen neuen Platform-User, führe `passwordStep` mit `curl` aus, base64-dekodiere den `enrollmentToken`, berechne TOTP, rufe `mfaEnrollStep` auf → erwartet: Enrollment gelingt ohne Session-Bindung.

### SEC-004 — Rate-Limit TOCTOU-Race im Platform-Login

- **Severity:** Mittel
- **Block:** 3 (Auth + Session)
- **Ort:** `src/lib/platform/rate-limit.ts:32-55`, aufgerufen aus `src/lib/platform/login-service.ts:132-141`
- **Beobachtung:** `checkLoginRateLimit` ruft zwei parallele `count()`-Queries (L39-46), vergleicht gegen Schwelle (L48-52), und RÜCKT ZURÜCK. Der Write erfolgt erst später via `recordAttempt` (L64-76) — in einem separaten Request-Pfad. Keine Transaktion umschließt Read+Write. Klassisches Check-then-Act.
- **Angriffsszenario:** Angreifer startet parallel 20+ `passwordStep`-Requests aus demselben IP. Zum Zeitpunkt der gleichzeitigen Check-Phase sehen alle 20 Counter = 0..N-1 (unter MAX_PER_IP=20), alle passieren, alle schreiben einen `recordAttempt`-Row. Nach dem Burst steht der Counter bei 20-39, aber in diesem Fenster wurden bis zu 2× mehr Attempts zugelassen als vorgesehen. Weil `MAX_PER_EMAIL=5` sehr niedrig ist, ist der Multiplikator gegen Passwort-Bruteforce kleiner; aber 5 erlaubte Versuche → bis zu 10 echte Versuche unter Race.
- **Impact:** Schwächere Brute-Force-Barriere gegen Platform-Admin-Passwort. Kein Full-Bypass, aber Amplifikation.
- **Empfohlene Richtung:** `checkLoginRateLimit` + `recordAttempt` in einem `$transaction` mit Serializable-Isolation, oder Counter über Postgres-Advisory-Lock, oder Sliding-Window-Counter in Redis statt DB-Counter.
- **Verifikation:** Integrationstest: 20 parallele Calls gegen `passwordStep` mit falschem Passwort → aktuell werden alle 20 als Failures gezählt; in einem korrekten Impl. würden nach dem 5. bereits `RateLimitedError` geworfen.

### SEC-005 — `loadAbsenceDay` Raw-SQL ohne tenant_id-Filter (Defense-in-Depth)

- **Severity:** Mittel
- **Block:** 1 (Tenant-Isolation)
- **Ort:** `src/lib/services/daily-calc.ts:419-434`
- **Beobachtung:** Query filtert nur `ad.employee_id = ${employeeId}::uuid AND ad.absence_date = ${date}::date`, ohne `tenant_id`. Die LEFT JOINs auf `absence_types` und `calculation_rules` sind ebenfalls tenant-offen.
- **Angriffsszenario:** Hypothese — praktisch UUID-unabhängig: `employeeId` stammt aus upstream-validiertem Tenant-Kontext. Ein Cross-Tenant-Leak würde voraussetzen, dass (a) ein Angreifer die Funktion mit einem fremden `employeeId` aufruft, und (b) das Ergebnis ins JSON des eigenen Tenants landet. Weil UUIDv4 global eindeutig sind, kommt (b) praktisch nicht vor.
- **Impact:** Reiner Defense-in-Depth-Verstoß. Falls irgendwo ein nicht-UUID-ID-Schema (z.B. eine BIGINT-Sequenz) unbeabsichtigt für `employee_id` verwendet würde, würde der Filter plötzlich fehlen.
- **Empfohlene Richtung:** `AND ad.tenant_id = ${tenantId}::uuid` ergänzen; dasselbe für die LEFT-JOIN-Tabellen. Gleiches Refactoring für ähnliche Queries in `daily-value-repository.ts:102-109` und `bookings.ts:56-72`.
- **Verifikation:** Test: zwei Tenants, identische `employee_id` erzwingen (per DB-Insert mit fixer UUID) → Query liefert aktuell den falschen Tenant-Row.

### SEC-006 — Platform Autofinalize-Cron lädt `platformSubscription` ohne Tenant-Filter

- **Severity:** Mittel
- **Block:** 7 (Finanzdaten) / 2 (Platform-Auth)
- **Ort:** `src/lib/platform/subscription-autofinalize-service.ts:78-88`
- **Beobachtung:** Der Cron iteriert über alle `platformSubscription`-Zeilen mit `status = "active"` ohne `tenantId`-Einschränkung. Die nachgelagerten `billingRecurringInvoice.findFirst` (L100-106) und `billingDocument.findFirst` (L119-127) filtern dagegen explizit auf `operatorTenantId` — das begrenzt den Schaden erheblich.
- **Angriffsszenario:** Hypothese — Escalation-Pfad: Ein Angreifer mit DB-Write-Access (nicht über reguläre App-APIs erreichbar, weil `createSubscription` in `subscription-service.ts` `isOperatorTenant`-Check + Permissions erzwingt) kann eine `platformSubscription`-Zeile einschleusen, die auf eine `billingRecurringInvoice` eines anderen Tenants zeigt. Der nachfolgende `findFirst({ tenantId: operatorTenantId })` würde `null` zurückgeben → kein Finalize. Praktisch nicht exploitbar über App-APIs.
- **Impact:** Reines Defense-in-Depth. Bei fehlerhaftem zukünftigen Code-Refactoring könnte der fehlende initiale Filter zum Problem werden.
- **Empfohlene Richtung:** `where: { tenantId: { not: operatorTenantId }, … }` ODER expliziter Gegen-Check `if (sub.tenantId === operatorTenantId) continue` zu Beginn der Schleife.
- **Verifikation:** Unit-Test: Fake `platformSubscription` mit `tenantId = operatorTenantId` einfügen → Cron sollte diese Row ignorieren.

### SEC-007 — `internalNotes`-Marker als Sub-String ist tenant-intern fälschbar

- **Severity:** Mittel
- **Block:** 7 (Finanzdaten)
- **Ort:** `src/lib/platform/subscription-service.ts:286-300` (Marker-Definition + Detektor), Verwendung in `src/lib/services/reminder-eligibility-service.ts:181`, `src/lib/services/bank-transaction-matcher-service.ts:82, 617`, `src/trpc/routers/bankStatements.ts:360`
- **Beobachtung:** Der Marker `[platform_subscription:<uuid>]` ist Plaintext in `BillingDocument.internalNotes` und wird per `.includes(…)` erkannt. `internalNotes` ist via `billing-document-service.ts:update` für DRAFT-Docs durch Nutzer mit `billing_documents.edit`-Permission editierbar. Nach Finalize ist das Feld eingefroren (`assertDraft`-Guard in `update`).
- **Angriffsszenario:** Tenant-User mit DRAFT-Edit-Permission erzeugt eine eigene Rechnung, pastet `[platform_subscription:any-uuid]` in `internalNotes`, finalisiert. Der Marker bleibt stehen. Effekte: (a) Dunning-Cron überspringt die Rechnung (`reminder-eligibility-service.ts:181`), (b) Bank-Transaction-Matcher schließt sie aus (`bank-transaction-matcher-service.ts:82`), (c) lastUnmatched-View im Dashboard ignoriert sie.
- **Impact:** Tenant-intern: Ein Nutzer kann Rechnungen vor dem Mahnwesen und der automatischen Abgleich-Logik verstecken. Das ist kein Cross-Tenant-Risiko, aber eine Manipulation, die Gelder hinterziehen oder sabotieren könnte. Auditlogs würden den Insert protokollieren, aber nicht die Marker-Injection als solche hervorheben.
- **Empfohlene Richtung:** Marker nicht in `internalNotes`, sondern in einer eigenen dedicated Column `BillingDocument.platformSubscriptionId` (FK / indexed). Alternativ: Whitelist-Regex in `update`, die verhindert, dass Nutzer `[platform_subscription:` in `internalNotes` schreiben.
- **Verifikation:** tRPC-Call `billingDocument.update` auf eine eigene Rechnung mit `internalNotes: "[platform_subscription:xyz]"`, dann Dunning-Eligibility simulieren → Rechnung taucht nicht in Kandidatenliste auf.

### SEC-008 — `FIELD_ENCRYPTION_KEY_V1` fehlt in `.env.example`

- **Severity:** Mittel (operational — Missconfig kann Production-Write-Path breaken)
- **Block:** 5 (Secrets)
- **Ort:** `.env.example` (fehlt), `src/lib/config.ts` (Env-Validierung), `src/lib/services/field-encryption.ts:24-44` (Key-Loader)
- **Beobachtung:** `field-encryption.ts` liest `FIELD_ENCRYPTION_KEY_V1..V10` über `getKeys()`. Schema-Validierung an bekannten Stellen verweist auf diese Variable, aber `.env.example` listet sie nicht. Ein Operator, der `.env.example` als Template verwendet, deployt ohne Key → `encryptField` wirft im ersten Write-Pfad.
- **Angriffsszenario:** Kein direktes Angriffsszenario — aber das Fehlen des Docs kann dazu führen, dass (a) in Dev/Staging ein unsicherer Default verwendet wird (z.B. ein im Dockerfile hardgecodeter Test-Key), (b) in Prod ein halbrolliertes Deployment crashed wenn der Key neu generiert wird und alte Werte nicht entschlüsselbar sind.
- **Impact:** Verfügbarkeit / operationales Risiko; kein Confidentiality-Impact.
- **Empfohlene Richtung:** `.env.example` um `FIELD_ENCRYPTION_KEY_V1=<generate with openssl rand -base64 32>` und `FIELD_ENCRYPTION_KEY_CURRENT_VERSION=1` ergänzen. Pre-Deploy-Script, das fehlende Keys blockiert.
- **Verifikation:** Frisches Dev-Setup aus `.env.example` kopieren → `pnpm dev` + ein verschlüsselnder Pfad (TOTP-Enrollment) crasht mit "FIELD_ENCRYPTION_KEY_V1 not configured".

### SEC-009 — Serverseitige IBAN-Checksum-Validierung fehlt in `billingTenantConfig.upsert`

- **Severity:** Mittel
- **Block:** 6 (Input-Validation)
- **Ort:** `src/trpc/routers/billing/tenantConfig.ts:24` (Schema `iban: z.string().max(34)`), `src/lib/sepa/iban-validator.ts:15-34` (vorhandener Validator, nur clientseitig genutzt)
- **Beobachtung:** Das Schema prüft nur die Länge. `isValidIban()` existiert als mod-97-Prüfsummen-Check in `src/lib/sepa/iban-validator.ts`, wird aber nur im Formular aufgerufen. Direkte tRPC-Mutation akzeptiert `iban: "DE00 XXXX …"` unverifiziert.
- **Angriffsszenario:** Tenant-Admin (oder Angreifer mit gekaperter Session) setzt absichtlich eine falsche IBAN in `BillingTenantConfig`. Nachfolgende SEPA-pain.001-Generierung (siehe SEC-012) erzeugt mit dieser IBAN eine Datei, die vom Bank-Ingestion-System abgewiesen wird → Fehlerquelle schwer diagnostizierbar. Bei nicht-Checksum-fehlerhaften, aber falschen IBANs (z.B. IBAN eines fremden Accounts) könnten Zahlungsdispositionen fehlgeleitet werden.
- **Impact:** Integrität der Zahlungsdaten, mögliche Geldfehlverbuchungen.
- **Empfohlene Richtung:** `z.string().max(34).refine(isValidIban, 'Ungültige IBAN (Prüfsumme)')` in `upsertInput`. Dasselbe auf `createAddress`, `updateAddress` (CRM) und `paymentRun`-Input anwenden.
- **Verifikation:** tRPC-Call `billingTenantConfig.upsert` mit `iban: "DE00000000000000000000"` (ungültige Prüfsumme) → aktuell: akzeptiert; korrekt: ValidationError.

### SEC-010 — Keine Filegröße-Limits auf Supabase-Storage-Uploads

- **Severity:** Mittel
- **Block:** 6 (Input-Validation)
- **Ort:** `src/lib/supabase/storage.ts:85-101` (Upload-Helper), Konsumenten u.a. `src/lib/services/bank-statement-service.ts:87`, `src/lib/services/inbound-invoice-service.ts:96`, `src/lib/services/wh-article-image-service.ts`
- **Beobachtung:** Kein expliziter `Content-Length`- oder Buffer-Size-Check vor `.upload(...)`. Ein Tenant-User mit Upload-Permission (z.B. `bank_statements.import`, `inbound_invoices.upload`) kann beliebig große Dateien hochladen. Supabase hat ein Storage-Default-Limit (50 MB für Free-Tier, konfigurierbar), aber applikativ wird nicht geprüft.
- **Angrizsszenario:** DoS-Variante: ein Tenant-User pumpt 10 × 100 MB-Dateien hoch → Supabase-Quota verbrannt + Speichernutzung auf Tenant-Limit skaliert → finanzieller und operativer Impact. Zusätzlich: `bank-statement-camt-parser.ts:94` parst nach `.upload` die XML-Datei → Memory-Overflow bei Billion-Laughs-Style-XML, wenn keine Size-Grenze.
- **Impact:** Verfügbarkeit / Kosten.
- **Empfohlene Richtung:** `MAX_UPLOAD_BYTES` konstante vor jedem Upload, Supabase-Bucket-Limit setzen, XML-Parser mit Size-Cap aufrufen.
- **Verifikation:** 500 MB-Zufallsdatei gegen `inboundInvoice.upload` posten → aktuell akzeptiert; korrekt: PayloadTooLargeError.

### SEC-011 — `fast-xml-parser` ohne explizite DTD-/Entity-Deaktivierung

- **Severity:** Niedrig
- **Block:** 6 (Input-Validation)
- **Ort:** `src/lib/services/bank-statement-camt-parser.ts:94-104`, `src/lib/services/zugferd-xml-parser.ts:118-127`
- **Beobachtung:** Keine Optionen `processEntities: false` oder `processDoctype: false` gesetzt. `fast-xml-parser` ist im Default DTD-/External-Entity-sicher (verarbeitet keine SYSTEM-Entities), aber es fehlt die explizite Hardening-Deklaration als Defense-in-Depth.
- **Angriffsszenario:** Hypothese — falls eine zukünftige Library-Version den Default ändert (wie `libxmljs` 2020) oder falls ein Dev-Opt-In setzt, wird XXE plötzlich möglich. Aktuell nicht exploitbar.
- **Impact:** Keiner im aktuellen Zustand, latentes Regressionsrisiko.
- **Empfohlene Richtung:** In beiden Parsers `new XMLParser({ …existing, processEntities: false, stopNodes: ["*.DOCTYPE"] })` setzen.
- **Verifikation:** Test-XML mit `<!DOCTYPE foo SYSTEM "file:///etc/passwd">` einspeisen → erwartet: Parser wirft oder ignoriert; aktuell: ignoriert (default), aber nicht erzwungen.

### SEC-012 — SEPA `pain.001` wird ohne XSD-Validierung zur Bank gesendet

- **Severity:** Mittel (Pre-Launch-Blocker laut Memory)
- **Block:** 7 (Finanzdaten)
- **Ort:** `src/lib/services/payment-run-xml-generator.ts`, `src/lib/services/payment-run-xml-flow.ts:117` (Upload ohne Validator)
- **Beobachtung:** Der Generator baut das XML aus Tenant-Daten, rechnet SHA-256-Hash für Audit (L248), und lädt es nach Supabase hoch. Es gibt keinen Aufruf gegen das offizielle `pain.001.001.09.xsd`.
- **Angriffsszenario:** Nicht-Angreifer-Fall, sondern Integrationsrisiko: Sonderzeichen in Empfängername (Umlaute, `&`), überlange Remittance-Info (>140), malformierte Währungsdezimale → PSP/Bank weist Datei mit kryptischen Fehlern ab oder (schlimmer) akzeptiert sie partiell. Ein Tenant-Admin könnte unbeabsichtigt "Injection" bauen, indem ein CRM-Adressfeld `<` oder XML-sensitive Zeichen enthält — der XMLBuilder escaped das zwar, aber ohne XSD-Validierung bemerkt niemand eine Regression.
- **Impact:** Zahlungslauf fällt aus, im worst case werden falsche Beträge übertragen.
- **Empfohlene Richtung:** Vor `upload()` XSD-Validierung via `libxmljs2` oder `xsd-schema-validator` gegen das pain.001.001.09-Schema. Pre-Launch-Blocker-Ticket bereits bekannt (Memory-Referenz).
- **Verifikation:** Fake-Run mit `ultimateRemitter.name = "<evil>"` → erwartet: XSD-Validator lehnt ab; aktuell: XML-Datei wird upgeladen.

### SEC-013 — `bootstrap-platform-user.ts` hat keinen Runtime-Guard gegen Prod-DB

- **Severity:** Niedrig
- **Block:** 3 (Auth + Session)
- **Ort:** `scripts/bootstrap-platform-user.ts`
- **Beobachtung:** Das Script liest `DATABASE_URL` aus der Env und schreibt direkt in `platform_users`. Es gibt eine Redaction-Ausgabe (Zeilen 138-140), aber keinen Abbruch bei `NEXT_PUBLIC_ENV=production` oder ähnlich.
- **Angriffsszenario:** CI-Pipeline oder DevOps-Skript mit versehentlich gesetzter Prod-`DATABASE_URL` erzeugt einen Platform-User, ohne dass jemand bewusst zustimmt. Insider-Risk oder Environment-Confusion.
- **Impact:** Unerwünschte Prod-Platform-User, potentielle Bootstrap-Hijack-Szenarien. Auditlogs protokollieren den Insert, aber die Warnzeit reduziert sich erheblich.
- **Empfohlene Richtung:** Zeile 1 des Script-Bodies: `if (process.env.NODE_ENV === "production" || serverEnv.env === "production") { throw new Error("Bootstrap against prod requires explicit --confirm-prod flag") }`. Zusätzlich: readline-Bestätigung ("y/n").
- **Verifikation:** Script mit `DATABASE_URL=<prod-url> NODE_ENV=production pnpm tsx scripts/bootstrap-platform-user.ts foo@bar test` ausführen → aktuell: schreibt Row; korrekt: bricht ab.

### SEC-014 — `supportSession.getById` ohne Operator-Scoping

- **Severity:** Niedrig
- **Block:** 2 (Platform-Auth)
- **Ort:** `src/trpc/platform/routers/supportSessions.ts:82-100`
- **Beobachtung:** `platformAuthedProcedure` genügt; `input.id` wird direkt gegen `supportSession.findUnique` gemappt, ohne auf `platformUserId === ctx.platformUser.id` zu prüfen.
- **Angriffsszenario:** Jeder Platform-Operator kann die SupportSession-Metadaten eines anderen Operators einsehen, wenn er die ID kennt. Sessions sind UUID — Enumeration unpraktisch, aber aus Audit-Logs/Emails könnte eine ID geleakt werden.
- **Impact:** Informationsleak: Welche Operatoren welche Tenants impersonieren. Für Insider-Abuse-Erkennung relevant, aber keine Cross-Tenant-Kompromittierung.
- **Empfohlene Richtung:** `findFirst({ where: { id, platformUserId: ctx.platformUser.id } })` ODER eigene Admin-Rolle mit `support_sessions.view_all` abkoppeln.
- **Verifikation:** Zwei Platform-Operators aufsetzen, Operator A erstellt SupportSession S, Operator B ruft `supportSessions.getById({ id: S })` → aktuell: erfolgreich.

### SEC-015 — `activityCodesKldb.search` — `plainto_tsquery` mit User-Input

- **Severity:** Niedrig
- **Block:** 6 (Input-Validation)
- **Ort:** `src/trpc/routers/activityCodesKldb.ts:43-53`
- **Beobachtung:** User-Input `input.query` geht via `${input.query}` in `plainto_tsquery('german', ${input.query})` — Prisma-Tagged-Template parametrisiert sauber (kein SQLi). Zusätzlich wird derselbe Input als `code LIKE ${input.query + "%"}` verwendet.
- **Angriffsszenario:** Kein SQLi. Mögliches DoS bei sehr langem Input (LIKE auf `%`-Präfix-String). Zod-Schema prüft die Länge nicht (kein sichtbares `.max(…)` im Input).
- **Impact:** Minimal — KLDB ist öffentliche Referenzdaten. DoS theoretisch, praktisch schwach.
- **Empfohlene Richtung:** `input.query: z.string().min(2).max(100)`.
- **Verifikation:** `activityCodesKldb.search({ query: "a".repeat(100000) })` — aktuell akzeptiert.

### SEC-016 — Mutationen ohne Zod-Schema

- **Severity:** Niedrig
- **Block:** 6 (Input-Validation)
- **Ort:** `src/trpc/routers/auth.ts:95` (logout), `src/trpc/routers/notifications.ts:228` (clearAll), `src/trpc/routers/payrollWages.ts:40,81` (recalculateAll, export), `src/trpc/routers/users.ts:417` (updateMyProfile), `src/trpc/platform/routers/auth.ts:151` (logout)
- **Beobachtung:** Diese Mutationen haben kein `.input(…)`. Bei allen außer `users.ts:417` (updateMyProfile) ist das ok — input-leer. `updateMyProfile` sollte eine User-Body akzeptieren; ohne Schema lässt Implementation jeden Felder-Shape zu.
- **Angriffsszenario:** In `updateMyProfile` je nach Service-Implementierung möglich, dass ein User Felder wie `role`, `isAdmin`, `userGroupId` setzt. Verifikation im Service selbst notwendig.
- **Impact:** Hängt vom Service ab — wenn der Service eigene Allow-Liste hat, kein Issue. Ohne expliziten Zod kann ein Dev später versehentlich `{…input}`-Spread in Prisma einfügen.
- **Empfohlene Richtung:** Explizites Zod-Schema mit Allow-List für `updateMyProfile`.
- **Verifikation:** `users.ts:417` lesen und Service-Fn checken, ob sie selectiv Felder auswählt.

### SEC-017 — `Prisma.sql`-Wrapper wird inkonsistent verwendet

- **Severity:** Informativ
- **Block:** 1 (Tenant-Isolation)
- **Ort:** Ca. 15 Repositories unter `src/lib/services/wh-*-repository.ts`, `src/lib/services/*-repository.ts`
- **Beobachtung:** Viele Raw-Queries nutzen das Prisma-Tagged-Template (`prisma.$queryRaw\`…\``), was automatisch parametrisiert — SQLi-sicher. Andere nutzen `Prisma.sql` (für Komposition / bedingte Fragmente). Keine der untersuchten Queries verwendet String-Concat oder `$queryRawUnsafe` — aber die Mixed-Style erschwert das Audit.
- **Angriffsszenario:** Kein direkter Angriff. Risiko: Ein Dev verwechselt beim Refactoring die Modi und schreibt `$queryRawUnsafe(\`… ${var} …\`)` → SQLi.
- **Impact:** Keiner aktuell.
- **Empfohlene Richtung:** ESLint-Regel `no-restricted-syntax` für `$queryRawUnsafe` / `$executeRawUnsafe`. Style-Guide: Für neue Raw-Queries `Prisma.sql` bevorzugen.
- **Verifikation:** `grep -r "\\$queryRawUnsafe" src/` → aktuell: 0 Treffer.

### SEC-018 — DSGVO-Retention löscht `audit_logs`

- **Severity:** Informativ
- **Block:** 4 (Audit-Log)
- **Ort:** `src/lib/services/dsgvo-retention-repository.ts:219-227`, `src/lib/services/dsgvo-retention-service.ts:476-477`, Default-Retention in `dsgvo-retention-service.ts:80-84` (24 Monate)
- **Beobachtung:** DSGVO-Retention-Cron löscht Audit-Log-Rows älter als Tenant-konfigurierter Retention-Zeitraum. Das ist by design (DSGVO-Pflicht), aber die Löschung selbst wird in `dsgvo_delete_logs` + `audit_logs` (Action `dsgvo_execute`) protokolliert. Da das Durchlöschen den Audit-Bestand selbst kürzt, ist eine "lückenlose" Forensik jenseits der Retention-Grenze nicht möglich.
- **Angriffsszenario:** Kein Angriff. Hinweis: Wenn ein Forensik-Fall nach 25 Monaten hochkommt, sind die Original-Logs weg. Platform-seitig nicht betroffen (platform_audit_logs werden nicht gelöscht).
- **Impact:** Acceptierte Einschränkung der Forensik.
- **Empfohlene Richtung:** Dokumentation in TERP_HANDBUCH (SLA für Forensik = Retention-Zeitraum). Keine Code-Änderung nötig.
- **Verifikation:** N/A.

---

## Nicht geprüfte Bereiche

- **`npm audit` / Dependency-Vulnerabilities:** Kein Scan 3rd-Party-Libraries durchgeführt. Empfohlen: `pnpm audit --production` vor jedem Release.
- **Runtime-Pentest:** Keine dynamische Analyse (Burp, OWASP ZAP, fuzzer). Dieser Audit ist rein statisch.
- **Supabase RLS:** Row-Level-Security-Policies nicht inspiziert. Bei der Terp-Architektur greift die App-Schicht vor, aber RLS als Defense-in-Depth sollte separat geprüft werden — insbesondere für die Buckets `bank-statements`, `inbound-invoices`, `billing-documents`.
- **CORS / CSP / Security-Headers:** Nicht untersucht. `src/middleware.ts` und `next.config.mjs` nicht auf `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options` geprüft.
- **Cross-Domain-Deployment:** Memory-Notiz zu `PLATFORM_COOKIE_DOMAIN` — der aktuelle Impl. geht von gleichem Host aus. Bei `admin.terp.de` ↔ `app.terp.de` ist der Cookie-Bridge-Pfad nicht gebaut.
- **Dritt-Party-Webhook-Endpunkte:** Webhook-Signatures (z.B. Stripe) nicht inspiziert, da unsicher ob solche Integrationen überhaupt existieren.
- **Secrets-Rotation:** `FIELD_ENCRYPTION_KEY_V1` → `V2`-Rotation ist code-seitig vorgesehen (getest), aber kein Runbook für produktive Rotation.
- **Platform-Impersonation-Bridge (Cross-Domain-Cookies):** Aktuell nur für Same-Host-Dev bekannt; Prod-Split-Domain-Architektur noch unbewertet.
- **Tiptap XSS in anderen Rendering-Pfaden:** Nur `document-editor.tsx:662` (footerHtml) inspiziert. Andere Tiptap-Content-Ausgaben (CRM-Notizen, Employee-Messages) müssten separat geprüft werden.
- **E-Mail-Header-Injection:** Versand-Pfade (Mailgun/Resend/SMTP) nicht geprüft auf CRLF-Injection.

---

## Empfehlung: Drei Findings für `/create_plan`

1. **SEC-001 (Recovery-Code-Race):** Klar umrissen, technisch lösbar in 2-3 Files (`login-service.ts` + Test). Hohe Severity, niedriger Aufwand — perfekter Erstkandidat.
2. **SEC-002 (Stored-XSS footerHtml):** DOMPurify-Integration + serverseitige Sanitization, einheitliches Vorgehen für alle `dangerouslySetInnerHTML`-Stellen. Medium-hohe Severity, mittlerer Aufwand — sollte parallel zu SEC-001 laufen.
3. **SEC-003 (TOTP-Enrollment-Token):** Secret aus Token in DB verschieben, Migration + Token-Shape-Change. Höherer Aufwand, aber kritischer Bootstrap-Pfad — Plan sinnvoll.

Optional als viertes Ticket: **SEC-007 (Marker-Spoofing)** — hat clean design path (dedicated column `platformSubscriptionId`) und würde zwei weitere latente Issues (SEC-006, Robustheit des Autofinalize-Crons) mitadressieren.
