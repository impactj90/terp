---
description: Full workflow: research → plan → implement → test
model: opus
---

# Full Workflow

Orchestrates the complete development cycle by spawning sub-agents for each phase. Each sub-agent has isolated context and communicates via files.

## CRITICAL: You MUST use the Task tool to spawn sub-agents

Do NOT execute the commands yourself. Use the `Task` tool to spawn a separate agent for each phase. This ensures fresh context per phase.

## When this command is invoked:

### 1. Process Input

- Read any referenced files FULLY (no limit/offset)
- Extract ticket ID if present (e.g., ENG-1234)
- Note today's date (YYYY-MM-DD format)
- Store as `USER_INPUT`, `TICKET_ID`, `TODAY`
- Expected file pattern: `{TODAY}-{TICKET_ID}-description.md`

### 2. Create Tracking Todo

Use TodoWrite to create:

```
- [ ] Phase 1: Research (spawn sub-agent)
- [ ] Phase 2: Plan (spawn sub-agent)
- [ ] Phase 3: Implement (spawn sub-agent)
- [ ] Phase 4: Run tests
```

### 3. Phase 1: Research Sub-Agent

**USE THE TASK TOOL** to spawn a sub-agent:

```
Task(
  description: "Research codebase for: {USER_INPUT}",
  prompt: """
You are a research agent. Execute the /research_codebase command.

YOUR INPUT:
{USER_INPUT}

YOUR TASK:
Follow the ~/.claude/commands/research_codebase.md instructions exactly:
1. Analyze and decompose the research question
2. Use codebase-locator, codebase-analyzer, pattern-finder agents
3. Document ONLY what exists - no improvement suggestions
4. Write the research document to thoughts/shared/research/

WHEN COMPLETE:
Respond with ONLY this line:
RESEARCH_COMPLETE: <full path to created file>
"""
)
```

**Wait for the Task to complete.**

**CRITICAL - Extract the exact file path:**

1. The sub-agent response will contain: `RESEARCH_COMPLETE: <path>`
2. Parse the EXACT path from this response (e.g., `thoughts/shared/research/2025-01-24-ENG-1234-feature.md`)
3. Store this as `RESEARCH_PATH` - you will use this EXACT path in Phase 2
4. Verify the file exists using: `ls -la {RESEARCH_PATH}`

Update todo: `- [x] Phase 1: Research (spawn sub-agent)`

### 4. Phase 2: Planning Sub-Agent

**USE THE TASK TOOL** to spawn a sub-agent.

**IMPORTANT:** Use the EXACT `RESEARCH_PATH` from Phase 1 - do NOT use a placeholder or guess the filename.

```
Task(
  description: "Create implementation plan based on research",
  prompt: """
You are a planning agent. Execute the /create_plan command.

YOUR INPUT:
Read this research document FULLY: {RESEARCH_PATH}

NOTE: This is the exact file created by the research phase. Read it completely before proceeding.

YOUR TASK:
Follow the ~/.claude/commands/create_plan.md instructions exactly:
1. Read the research document completely
2. Analyze and verify understanding
3. Research code patterns with sub-agents
4. Create a detailed plan with phases and verification steps
5. Write the plan to thoughts/shared/plans/

WHEN COMPLETE:
Respond with ONLY this line:
PLAN_COMPLETE: <full path to created file>
"""
)
```

**Wait for the Task to complete.**

**CRITICAL - Extract the exact file path:**

1. The sub-agent response will contain: `PLAN_COMPLETE: <path>`
2. Parse the EXACT path from this response (e.g., `thoughts/shared/plans/2025-01-24-ENG-1234-feature.md`)
3. Store this as `PLAN_PATH` - you will use this EXACT path in Phase 3
4. Verify the file exists using: `ls -la {PLAN_PATH}`

Update todo: `- [x] Phase 2: Plan (spawn sub-agent)`

### 5. Phase 3: Implementation Sub-Agent

**USE THE TASK TOOL** to spawn a sub-agent.

**IMPORTANT:** Use the EXACT `PLAN_PATH` from Phase 2 - do NOT use a placeholder or guess the filename.

```
Task(
  description: "Implement the plan",
  prompt: """
You are an implementation agent. Execute the /implement_plan command.

YOUR INPUT:
Read this plan FULLY: {PLAN_PATH}

NOTE: This is the exact file created by the planning phase. Read it completely before proceeding.

YOUR TASK:
Follow the ~/.claude/commands/implement_plan.md instructions exactly:
1. Read the plan completely
2. Implement phase by phase
3. Run automated verification after each phase
4. Stop at manual verification steps

WHEN COMPLETE:
Respond with:
IMPLEMENTATION_COMPLETE
Phases completed: <list>
Tests: <PASSED/FAILED>
Manual verification pending: <list>
"""
)
```

**Wait for the Task to complete.**

- Update todo: `- [x] Phase 3: Implement (spawn sub-agent)`

### 6. Phase 4: Final Tests

Run directly (no sub-agent needed):

```bash
make test
```

Update todo: `- [x] Phase 4: Run tests`

### 7. Present Summary

```
═══════════════════════════════════════════════════════════
✅ WORKFLOW COMPLETE
═══════════════════════════════════════════════════════════

📄 Research:  {RESEARCH_PATH}
📋 Plan:      {PLAN_PATH}
🧪 Tests:     [PASSED/FAILED]

Manual verification pending:
- [ ] [items from implementation response]
```

---

## Error Handling

If a Task fails:

1. Stop the workflow immediately
2. Show which phases completed successfully
3. Show the error from the failed Task
4. Ask: "Should I retry this phase or would you like to intervene manually?"

## Resuming

`/full_workflow --from-research <path>`:

- Skip phase 1, use provided research file, spawn sub-agent for phase 2

`/full_workflow --from-plan <path>`:

- Skip phases 1 and 2, spawn sub-agent for phase 3 only

---

## Important Notes

- **ALWAYS use the Task tool** - never execute commands directly in main context
- Each Task runs in **isolated context** (like a fresh conversation)
- Files in thoughts/shared/ are the **communication channel** between agents
- Wait for each Task to **fully complete** before starting the next
- The main orchestrator only **coordinates** - sub-agents do the actual work
