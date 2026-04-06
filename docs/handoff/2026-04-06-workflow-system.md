# Workflow System — Implementation Handoff

## Context

Brainstormed and designed a markdown-based project workflow system for Claude Code projects. The system standardizes planning and execution using ROADMAP.md → milestones → tasks, with YAML frontmatter as the single source of truth.

## What was done

- Pivoted from session tags rework → workflow system design (session tags aren't the priority — tags on workflow markdown files are)
- Chose skill-based approach (Approach C): full conventions load on demand, CLAUDE.md stays lean with a 2-line stub
- Design spec written and reviewed

## Spec location

`docs/superpowers/specs/2026-04-06-workflow-system-design.md`

## What's next

1. **Invoke the `writing-plans` skill** with the spec to create an implementation plan
2. Key deliverables: `new-project` script, workflow skill, `plan-to-roadmap` skill
3. Additional skills (close-task, next-task) identified during implementation

## How to resume

```
Read docs/superpowers/specs/2026-04-06-workflow-system-design.md, then invoke the writing-plans skill to create the implementation plan.
```
