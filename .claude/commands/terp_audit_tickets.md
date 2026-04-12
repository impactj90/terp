---
name: terp-audit-tickets
description: >
  Use this skill to convert ANY production audit report into actionable ticket files
  for the Terp codebase. Triggers when the user pastes or references an audit report
  and wants to create tickets, or says things like: "create tickets from this audit",
  "turn this into tickets", "make tickets for the audit findings", "generate bug tickets",
  "create full_workflow tickets from the audit", "break this audit into tickets".
  Works with any audit type: security, performance, DSGVO, tenant isolation, race conditions,
  N+1 queries, cache invalidation, input validation, or any future audit category.
  Creates one markdown ticket file per logical fix group in thoughts/shared/audit/bugs/,
  detailed enough to be passed directly to /full_workflow without additional context.
---

# Terp Audit → Tickets Skill

## Goal

Convert any production audit report into a set of well-structured, self-contained
ticket files. Each ticket must contain everything `/full_workflow <ticket-path>` needs
to execute the fix — zero additional context required from the user.

---

## Step 1: Parse the Audit Report

When the user provides an audit report, extract:

1. **All findings** — every issue, regardless of category or severity
2. **Categories** — what audit types were run (use whatever categories the report defines)
3. **Severity per finding** — CRITICAL / HIGH / MEDIUM / LOW (or equivalent)
4. **Affected locations** — every file:line reference in the report
5. **Suggested fixes** — any fix hints already in the report

Do NOT assume which categories will be present. Read what is actually there.

---

## Step 2: Group Findings into Tickets

### Grouping principles (apply to any category)

**One ticket = one logical unit of work** that can be implemented and reviewed as a single PR.

| Group when...                      | Split when...                                      |
| ---------------------------------- | -------------------------------------------------- |
| Same fix pattern across many files | Different files need fundamentally different fixes |
| Same service/domain                | Different services with no shared code             |
| Same migration (DB changes)        | Scope would make the PR unreviewable (>15 files)   |
| Same hook file type                | Different risk levels that need separate review    |

**Batch size guidance:**

- Mechanical/repetitive fixes (same pattern, many files): max 15 files per ticket
  → Split into AUDIT-001a, AUDIT-001b etc. if more
- Logic fixes (transactions, business rules): max 1-2 service files per ticket
- Schema/migration changes: always one ticket regardless of count
- Hook-level fixes: can group all hooks of the same type together

### Priority assignment

| Report Severity | Ticket Priority | Meaning                           |
| --------------- | --------------- | --------------------------------- |
| CRITICAL        | P0              | Fix before any new feature work   |
| HIGH            | P1              | Fix before go-live                |
| MEDIUM          | P2              | Fix before go-live, lower urgency |
| LOW             | P3              | Deferred, nice to have            |

If a ticket mixes severities, use the highest severity present.

### Unknown categories

If the audit report contains a category not previously seen (e.g. DSGVO, Rate Limiting,
Encryption, Accessibility), apply the same grouping principles. Do not skip findings
just because the category is unfamiliar — create a ticket for it using the standard
template and document what you understood from the report.

---

## Step 3: Propose Before Writing

Before creating any files, present the proposed ticket list:

```
Based on the audit report, I'll create [N] tickets:

P0 — AUDIT-001: [Category]: [short description] ([X files / Y findings])
P0 — AUDIT-002: [Category]: [short description]
P1 — AUDIT-003: [Category]: [short description]
...

Shall I proceed, or would you like to adjust grouping or priority?
```

Wait for confirmation before writing any files.

---

## Step 4: Write Ticket Files

**Location:** `thoughts/shared/audit/bugs/`
**Naming:** `AUDIT-NNN-short-kebab-case-description.md`

Use a sequential number regardless of category. Numbers reflect priority order,
not category.

---

## Ticket Template

Every ticket uses this exact structure — for any category, any audit type:

````markdown
# AUDIT-NNN — [Short descriptive title]

| Field               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| **Priority**        | P0 / P1 / P2 / P3                                                    |
| **Category**        | [Exact category name from the audit report]                          |
| **Severity**        | CRITICAL / HIGH / MEDIUM / LOW                                       |
| **Audit Source**    | [Name/date of the audit report if available]                         |
| **Estimated Scope** | [e.g. "12 repository files", "1 service", "1 migration", "47 hooks"] |

---

## Problem

[2-4 sentences: WHAT is wrong, WHY it matters in production, WHAT can go wrong
if not fixed. Concrete and specific — name the real risk, not just the technical issue.
Do not use generic language like "this could cause issues".]

## Root Cause

[The exact anti-pattern causing the issue. Always include a code/config example
of the problematic pattern as it appears in the codebase.]

```ts
// ❌ Current pattern — found in [N] files
[exact bad code pattern from the report]
```

## Required Fix

[The exact fix. Always include a code/config example of the correct implementation.]

```ts
// ✅ Required pattern
[exact correct code pattern]
```

## Affected Files

[Complete list — copied verbatim from the audit report. Every file:line accounted for.
Never summarize or abbreviate. If the report says "27 more repositories", list them all.]

| File               | Line(s) | Specific Issue            |
| ------------------ | ------- | ------------------------- |
| `path/to/file.ts`  | 120     | [exact issue from report] |
| `path/to/other.ts` | 84, 175 | [exact issue from report] |
| ...                | ...     | ...                       |

## Verification

### Automated

- [ ] `pnpm test` — all existing tests pass
- [ ] `pnpm typecheck` — no type errors
- [ ] `pnpm lint` — no lint errors
- [ ] [Any specific test command relevant to the changed files]
- [ ] [Any migration command if schema changed: `pnpm prisma migrate dev`]

### Manual

- [ ] [Specific UI flow that exercises the fixed code]
- [ ] [Edge case or error scenario to test]
- [ ] [Security or correctness scenario if applicable]

## What NOT to Change

[Explicit out-of-scope list. Prevents the implementation agent from over-engineering.]

- [Specific layer or file type to leave untouched]
- [Related functionality that looks similar but is not part of this ticket]
- [Any other scope boundary]

## Notes for Implementation Agent

[Everything the /full_workflow agent needs that isn't obvious from the fix pattern.
Derived from the audit report and codebase conventions — not hardcoded constants.]

- [Import paths or helpers to use — instruct agent to verify before using]
- [Caveats or edge cases mentioned in the audit report]
- [Interaction with other tickets — e.g. "AUDIT-002 also touches this file"]
- [Codebase convention to follow — e.g. "follow the pattern in X which already does this correctly"]
- [What to do when the fix returns no result — e.g. error type to throw]
````

---

## How to Fill Each Section

### Problem — derive from the audit report

The report always explains WHY something is a problem. Extract it:

- "concurrent calls can exceed openAmount" → payment data integrity risk
- "double-invoke creates two invoice documents" → duplicate billing risk
- "full table scan" → performance degradation at scale
- If the report doesn't explain the risk, infer from the category and severity

### Root cause — extract the pattern

Look for the audit report's "Pattern to flag" or "Issue" column.
If the report gives a code example, use it.
If not, derive the pattern from the file:line references and category description.

### Affected files — copy, never summarize

If the report lists 39 files, the ticket lists 39 files.
If the report says "plus 27 more: [list]", include all 27.
A ticket with an incomplete file list will produce an incomplete fix.

### Notes for Implementation Agent — derive, don't hardcode

DO:

- "Verify the import path for the error helper before using it"
- "Follow the pattern already used in [file] which correctly does this"
- "Check if a shared helper exists before writing raw implementation"
- "This ticket touches the same file as AUDIT-XXX — coordinate to avoid conflicts"

DON'T:

- Hardcode specific import paths without telling the agent to verify
- Reference specific line numbers that may have shifted by implementation time
- Assume library APIs without telling the agent to check

---

## Step 5: Present Results

After all files are written:

```
Created [N] ticket files in thoughts/shared/audit/bugs/:

P0 — Fix immediately:
  AUDIT-001 → thoughts/shared/audit/bugs/AUDIT-001-[name].md
  AUDIT-002 → thoughts/shared/audit/bugs/AUDIT-002-[name].md

P1 — Fix before go-live:
  AUDIT-003 → thoughts/shared/audit/bugs/AUDIT-003-[name].md
  ...

P2 — Lower urgency:
  ...

P3 — Deferred:
  ...

To start fixing:
  /full_workflow thoughts/shared/audit/bugs/AUDIT-001-[name].md
```

---

## Quality Checklist

Before finalizing each ticket, verify:

- [ ] Problem explains real-world risk, not just the technical pattern
- [ ] Root cause has a concrete example of the bad pattern
- [ ] Required fix has a concrete example of the correct pattern
- [ ] Affected files list is complete — every file:line from the report is in some ticket
- [ ] No finding from the audit report is left without a ticket
- [ ] Verification has both automated commands AND manual steps
- [ ] "What NOT to Change" prevents scope creep
- [ ] "Notes for Implementation Agent" contains no hardcoded assumptions
- [ ] Ticket is fully self-contained — `/full_workflow` can run it with zero extra context
- [ ] Unknown categories are handled — no finding skipped because category was unfamiliar
