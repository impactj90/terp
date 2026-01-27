# AGENTS.md instructions for /home/tolga/projects/terp

<INSTRUCTIONS>
## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.
### Available skills
- ci-commit: Create git commits for session changes with clear, atomic messages (file: /home/tolga/.codex/skills/.system/ci-commit/SKILL.md)
- ci-describe-pr: Generate comprehensive PR descriptions following repository templates (file: /home/tolga/.codex/skills/.system/ci-describe-pr/SKILL.md)
- commit: Create git commits with user approval and no Claude attribution (file: /home/tolga/.codex/skills/.system/commit/SKILL.md)
- create-handoff: Create handoff document for transferring work to another session (file: /home/tolga/.codex/skills/.system/create-handoff/SKILL.md)
- create-plan: Create detailed implementation plans through interactive research and iteration (file: /home/tolga/.codex/skills/.system/create-plan/SKILL.md)
- create-plan-generic: Create detailed implementation plans with thorough research and iteration (file: /home/tolga/.codex/skills/.system/create-plan-generic/SKILL.md)
- create-plan-nt: Create implementation plans with thorough research (no thoughts directory) (file: /home/tolga/.codex/skills/.system/create-plan-nt/SKILL.md)
- create-worktree: No description available (file: /home/tolga/.codex/skills/.system/create-worktree/SKILL.md)
- debug: Debug issues by investigating logs, database state, and git history (file: /home/tolga/.codex/skills/.system/debug/SKILL.md)
- describe-pr: Generate comprehensive PR descriptions following repository templates (file: /home/tolga/.codex/skills/.system/describe-pr/SKILL.md)
- describe-pr-nt: Generate comprehensive PR descriptions following repository templates (file: /home/tolga/.codex/skills/.system/describe-pr-nt/SKILL.md)
- founder-mode: Create Linear ticket and PR for experimental features after implementation (file: /home/tolga/.codex/skills/.system/founder-mode/SKILL.md)
- full-workflow: Full workflow: research → plan → implement → test (file: /home/tolga/.codex/skills/.system/full-workflow/SKILL.md)
- implement-plan: Implement technical plans from thoughts/shared/plans with verification (file: /home/tolga/.codex/skills/.system/implement-plan/SKILL.md)
- iterate-plan: Iterate on existing implementation plans with thorough research and updates (file: /home/tolga/.codex/skills/.system/iterate-plan/SKILL.md)
- iterate-plan-nt: Iterate on existing implementation plans with thorough research and updates (file: /home/tolga/.codex/skills/.system/iterate-plan-nt/SKILL.md)
- learning-partner: Learning Partner (file: /home/tolga/.codex/skills/.system/learning-partner/SKILL.md)
- linear: Manage Linear tickets - create, update, comment, and follow workflow patterns (file: /home/tolga/.codex/skills/.system/linear/SKILL.md)
- local-review: Set up worktree for reviewing colleague's branch (file: /home/tolga/.codex/skills/.system/local-review/SKILL.md)
- oneshot: Research ticket and launch planning session (file: /home/tolga/.codex/skills/.system/oneshot/SKILL.md)
- oneshot-plan: Execute ralph plan and implementation for a ticket (file: /home/tolga/.codex/skills/.system/oneshot-plan/SKILL.md)
- ralph-impl: Implement highest priority small Linear ticket with worktree setup (file: /home/tolga/.codex/skills/.system/ralph-impl/SKILL.md)
- ralph-plan: Create implementation plan for highest priority Linear ticket ready for spec (file: /home/tolga/.codex/skills/.system/ralph-plan/SKILL.md)
- ralph-research: Research highest priority Linear ticket needing investigation (file: /home/tolga/.codex/skills/.system/ralph-research/SKILL.md)
- research-codebase: Document codebase as-is with thoughts directory for historical context (file: /home/tolga/.codex/skills/.system/research-codebase/SKILL.md)
- research-codebase-generic: Research codebase comprehensively using parallel sub-agents (file: /home/tolga/.codex/skills/.system/research-codebase-generic/SKILL.md)
- research-codebase-nt: Document codebase as-is without evaluation or recommendations (file: /home/tolga/.codex/skills/.system/research-codebase-nt/SKILL.md)
- resume-handoff: Resume work from handoff document with context analysis and validation (file: /home/tolga/.codex/skills/.system/resume-handoff/SKILL.md)
- validate-plan: Validate implementation against plan, verify success criteria, identify issues (file: /home/tolga/.codex/skills/.system/validate-plan/SKILL.md)
- skill-creator: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: /home/tolga/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: /home/tolga/.codex/skills/.system/skill-installer/SKILL.md)
### How to use skills
- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1) After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2) If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  3) If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  4) If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.
</INSTRUCTIONS>
