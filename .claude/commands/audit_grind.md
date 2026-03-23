---
description: Grind through audit bug tickets sequentially with full_workflow + verification tests
model: opus
---

# Audit Grind

Automatically processes audit bug tickets from `thoughts/shared/audit/bugs/` one by one. For each ticket: runs full_workflow, writes verification tests for manual items, runs test suites, and marks as done.

## CRITICAL: You MUST use the Task tool to spawn sub-agents

Do NOT execute /full_workflow or write tests yourself. Use the `Task` tool to spawn a separate agent for each phase. This ensures fresh context per phase.

## When this command is invoked:

### 1. Find Next Ticket

Run this bash command to find the first unfinished ticket:

```bash
ls thoughts/shared/audit/bugs/*.md | grep -v '_DONE\.md$' | sort | head -1
```

- If no tickets remain, announce **ALL TICKETS COMPLETE** and stop.
- Store the result as `TICKET_PATH` (e.g., `thoughts/shared/audit/bugs/AUDIT-005-race-conditions-billing-payment-service-case-atomicity.md`)
- Extract ticket ID from filename (e.g., `AUDIT-005`)
- Store as `TICKET_ID`

### 2. Create Tracking Todo

Use TodoWrite to create:

```
- [ ] Ticket: {TICKET_ID}
  - [ ] Phase 1: /full_workflow (spawn sub-agent)
  - [ ] Phase 2: Write verification tests (spawn sub-agent)
  - [ ] Phase 3: Run test suites (attempt 1/3)
  - [ ] Phase 4: Mark as DONE
```

### 3. Phase 1: Full Workflow Sub-Agent

**USE THE TASK TOOL** to spawn a sub-agent:

```
Task(
  description: "Full workflow for {TICKET_ID}",
  prompt: """
You are a workflow agent. Execute the /full_workflow command for an audit bug ticket.

YOUR INPUT:
Read this ticket FULLY: {TICKET_PATH}

YOUR TASK:
Follow the ~/.claude/commands/full_workflow.md instructions exactly:
1. Process the ticket as input
2. Phase 1: Research (spawn sub-agent)
3. Phase 2: Plan (spawn sub-agent)
4. Phase 3: Implement (spawn sub-agent)
5. Phase 4: Run initial tests

IMPORTANT:
- The ticket file contains all the information needed: problem description, root cause, required fix, affected files, and verification steps
- Follow the ticket's "What NOT to Change" section strictly
- Follow the ticket's "Notes for Implementation Agent" section

WHEN COMPLETE:
Respond with:
FULL_WORKFLOW_COMPLETE
Ticket: {TICKET_ID}
Tests: <PASSED/FAILED>
Manual verification pending: <list from implementation output>
"""
)
```

**Wait for the Task to complete.**

- If the Task reports failure, show the error and ask: "full_workflow failed for {TICKET_ID}. Should I retry or skip this ticket?"
- Update todo: mark Phase 1 complete

### 4. Phase 2: Write Verification Tests Sub-Agent

Read the ticket file `{TICKET_PATH}` and extract the **Verification > Manual** section. These are the items that need automated test coverage.

**USE THE TASK TOOL** to spawn a sub-agent:

```
Task(
  description: "Write verification tests for {TICKET_ID}",
  prompt: """
You are a test-writing agent. Your job is to write automated tests that verify the manual verification items from an audit ticket.

READ THESE FILES FULLY:
1. The ticket: {TICKET_PATH}
2. All affected files listed in the ticket's "Affected Files" table

YOUR TASK:
The ticket has a "Verification > Manual" section with items like:
{MANUAL_VERIFICATION_ITEMS}

For EACH manual verification item, write an automated test:
- Unit tests for isolated logic (e.g., validation, guards, computations)
- Integration tests for database operations (e.g., transaction atomicity, tenant isolation)
- E2E browser tests ONLY if the item requires UI interaction

PLACEMENT:
- Unit/integration tests: Place in `src/trpc/routers/__tests__/` following existing test patterns
- E2E tests: Place in `src/e2e-browser/` following existing test patterns

PATTERNS TO FOLLOW:
- Look at existing tests in the same directory for patterns (imports, setup, teardown)
- Tests use shared dev DB with transaction rollback isolation
- Use descriptive test names that reference the audit ticket: `{TICKET_ID}: <what is being verified>`

IMPORTANT:
- Do NOT modify existing test files unless adding to an existing describe block for the same router
- Create new test files if no existing file covers this area
- Make sure tests actually exercise the fix, not just the happy path
- For race condition fixes: test concurrent operations if possible
- For tenant isolation fixes: test cross-tenant access denial
- For input validation fixes: test boundary values and rejection

WHEN COMPLETE:
Respond with:
TESTS_WRITTEN
Files created/modified: <list>
Test count: <number of new tests>
"""
)
```

**Wait for the Task to complete.**

- Update todo: mark Phase 2 complete

### 5. Phase 3: Run Test Suites (max 3 attempts)

This is a retry loop. For each attempt (up to 3):

#### Attempt N:

Run the test suites directly (no sub-agent needed):

```bash
pnpm test 2>&1
```

Check the exit code. If tests pass, also run:

```bash
pnpm test:e2e 2>&1
```

**If ALL tests pass:**
- Update todo: mark Phase 3 complete
- Proceed to Phase 4

**If tests FAIL (attempt < 3):**

Spawn a fix sub-agent:

```
Task(
  description: "Fix failing tests for {TICKET_ID} (attempt {N})",
  prompt: """
You are a debugging agent. Tests are failing after implementing {TICKET_ID}.

TEST OUTPUT:
{PASTE THE FAILING TEST OUTPUT HERE}

YOUR TASK:
1. Read the failing test files and the implementation files
2. Diagnose why the tests fail
3. Fix the issue — prefer fixing the implementation over fixing the test, unless the test is wrong
4. Run the failing tests again to verify your fix

IMPORTANT:
- Do NOT delete or skip failing tests
- Do NOT weaken assertions to make tests pass
- If the implementation is wrong, fix the implementation
- If the test has a genuine bug (wrong assertion, wrong setup), fix the test

WHEN COMPLETE:
Respond with:
FIX_COMPLETE
What was wrong: <brief explanation>
What was fixed: <brief explanation>
"""
)
```

Then re-run the test suites (next attempt).

**If tests FAIL after 3 attempts:**

```
═══════════════════════════════════════════════════════════
⛔ TESTS STILL FAILING AFTER 3 ATTEMPTS — {TICKET_ID}
═══════════════════════════════════════════════════════════

Failing tests:
{PASTE FAILING OUTPUT}

Waiting for your input before continuing.
Options:
- "skip" — skip this ticket, move to next
- "retry" — try 3 more times
- "stop" — stop the grind entirely
- Or give me specific instructions to fix the issue
```

**STOP and wait for user input.** Do NOT proceed to the next ticket.

### 6. Phase 4: Mark as DONE

Rename the ticket file:

```bash
mv {TICKET_PATH} {TICKET_PATH%.md}_DONE.md
```

For example: `AUDIT-005-race-conditions-billing-payment-service-case-atomicity.md` → `AUDIT-005-race-conditions-billing-payment-service-case-atomicity_DONE.md`

Update todo: mark Phase 4 complete

Show progress:

```
═══════════════════════════════════════════════════════════
✅ {TICKET_ID} COMPLETE
═══════════════════════════════════════════════════════════

Ticket: {TICKET_PATH}
Status: DONE (renamed to _DONE.md)

Remaining tickets: {count of non-DONE tickets}
Next ticket: {next TICKET_ID or "none"}
═══════════════════════════════════════════════════════════
```

### 7. Loop to Next Ticket

Go back to **Step 1** — find the next unfinished ticket and repeat the entire process.

Each iteration uses fresh Task sub-agents, so context stays clean.

---

## Error Handling

- **full_workflow fails**: Stop, show error, ask user whether to retry or skip
- **Test writing fails**: Stop, show error, ask user
- **Tests fail 3 times**: Stop, show failing output, wait for user input with options (skip/retry/stop)
- **No more tickets**: Show final summary with all processed tickets

## Final Summary (when all tickets are done)

```
═══════════════════════════════════════════════════════════
🏁 AUDIT GRIND COMPLETE
═══════════════════════════════════════════════════════════

Processed tickets:
- ✅ AUDIT-005: Race conditions billing payment
- ✅ AUDIT-006: Tenant isolation find without tenantId
- ...
- ⏭️ AUDIT-014: Skipped (tests failed)
- ...

Total: {done}/{total} tickets completed
═══════════════════════════════════════════════════════════
```

## Resuming

If you invoke `/audit_grind` and some tickets are already `_DONE.md`, the command automatically skips them and picks up from the first unfinished ticket.

## Important Notes

- **ALWAYS use the Task tool** for full_workflow and test-writing — never execute in main context
- Each Task runs in **isolated context** (fresh conversation)
- The ticket file IS the specification — no separate research/plan files needed for the sub-agent
- Wait for each Task to **fully complete** before starting the next
- The main orchestrator only **coordinates** — sub-agents do the actual work
- Tests must PASS before marking a ticket as DONE — no exceptions
