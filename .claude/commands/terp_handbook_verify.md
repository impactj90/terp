---
name: terp-handbook-verify
description: Verifies that a specific section of TERP_HANDBUCH_V2.md matches the actual implementation in the codebase. Use this skill whenever the user wants to verify a specific section of the handbook against the code, check if a described feature works as documented, or find gaps between documentation and reality. Trigger when the user says things like "verify section X", "check if section X is correct", "does the handbook match the code for X", or "find gaps in section X". Always requires a section name or number as argument.
---

# Terp Handbook Section Verification Skill

Cross-checks a **specific section** of TERP_HANDBUCH_V2.md against the actual codebase.

## Usage

The user always provides a section to verify. Examples:

- `verify section 4.6` — Arbeitszeitmodelle
- `verify section 8.2` — Korrekturassistent
- `verify section 6.6` — 3-Schicht-Betrieb
- `verify section 5.4` — Tagesberechnung

## Process

### Step 1: Extract only the relevant section

Do NOT read the entire handbook. Use grep or sed to extract only the requested section:

```bash
# Find the start line of the section
grep -n "^### 4\.6\|^## 4\.6" TERP_HANDBUCH_V2.md

# Find start and end line, then read only those lines
sed -n '<start>,<end>p' TERP_HANDBUCH_V2.md
```

Read only that section. Nothing else from the handbook.

### Step 2: Build a verification checklist

From the extracted section, collect every verifiable claim:

- **Navigation paths** — every 📍 path
- **Form fields** — every field name, type, placeholder, required/optional
- **Tabs** — every tab name mentioned
- **Buttons & actions** — every button, dropdown, action described
- **Field values** — every concrete example value (e.g. `FS`, `06:00`, `30`)
- **Business logic** — every rule described (e.g. "Toleranz snap", "goTo kein Limit")
- **✅ Checkpoints** — every described outcome after an action

### Step 3: Find the relevant code

Based on the section topic, find only the relevant files:

```bash
# Find the page component
find src/app -name "*.tsx" | xargs grep -l "<keyword>"

# Find the form component
find src/components -name "*.tsx" | xargs grep -l "<keyword>"

# Find the tRPC router
find src/trpc/routers -name "*.ts" | xargs grep -l "<keyword>"

# Find the service/calculation logic
find src/lib -name "*.ts" | xargs grep -l "<keyword>"
```

Read only the files relevant to the section being verified.

### Step 4: Verify each claim

For every item in the checklist from Step 2:

| Claim type          | How to verify                                                         |
| ------------------- | --------------------------------------------------------------------- |
| Navigation path     | Check `src/app/[locale]/(dashboard)/` directory structure             |
| Form field          | Check form component — does the field exist with that name?           |
| Tab name            | Check component — does the tab exist with that label?                 |
| Button              | Check component — does the button exist? Does it do what's described? |
| Field value example | Check schema/validation — is the example value valid?                 |
| Business logic      | Check calculation/service code — does the logic match?                |
| ✅ Checkpoint       | Check what the component actually renders after the action            |
| i18n label          | Check messages/de.json — does the label match?                        |

### Step 5: Report findings

Structure the output as:

```
## Verification: Section X.X — [Section Title]

### ✅ Correct
- [claim] → verified in [file:line]

### ⚠️ Minor Gap
- [claim] → [what the handbook says] vs [what the code does]

### ❌ Wrong / Missing
- [claim] → [what the handbook says] but [reality]
- Suggested fix: [what to change in handbook OR code]

### 📋 Summary
- X claims verified ✅
- X minor gaps ⚠️
- X errors ❌
- Recommendation: [update handbook / fix code / both]
```

### Step 6: Fix

After reporting, ask the user:

> "Soll ich die Fehler beheben? (Handbuch anpassen / Code anpassen / beides)"

If yes — make the fixes. Then re-verify the fixed claims.

## Rules

- **Never read the full handbook** — only the requested section
- **Never read irrelevant files** — only files related to the section
- **Be precise** — cite file and line number for every finding
- **Distinguish handbook fix vs code fix** — sometimes the handbook is wrong, sometimes the code is wrong
- **Check i18n** — if UI labels are referenced, verify they match messages/de.json
