---
name: ponytail-help
description: >-
  Quick reference for ponytail levels, skills, and commands in Antigravity. One-shot display.
  Use for /ponytail-help, "ponytail help", "how do I use ponytail".
---

# Ponytail Help & Quick Reference

Ponytail brings the "lazy senior developer" mindset into Antigravity: solve the whole problem with the least new code, lean on existing codebase patterns and platform defaults, and keep answers razor-sharp.

## Available Slash Commands

| Command | What it does |
|---------|--------------|
| `/ponytail` | Activates Ponytail full mode (least new code, tests on risky logic, note skipped items & risks). |
| `/ponytail lite` | Lite mode: build what was requested, suggest simpler alternative in 1 line. |
| `/ponytail ultra` | Ultra mode: aggressively push back on unnecessary requirements before writing any code. |
| `/ponytail off` | Turn off Ponytail mode and revert to standard behavior. |
| `/ponytail-review` | Senior-dev code review of current diff or named commit/PR/files (correctness, safety, scale, tests, lean). |
| `/ponytail-audit` | Whole-repo quality & bloat audit, ranked by severity. |
| `/ponytail-debt` | Harvest `shortcut:` and `ponytail:` comments into a debt ledger. |
| `/ponytail-gain` | Show empirical benchmark savings (code, tokens, time, test coverage). |
| `/ponytail-help` | Display this reference guide. |

## The Simplicity Ladder

Before writing code, stop at the first rung that works:
1. **Need:** Does this actually need to exist? (YAGNI)
2. **Reuse:** Already in this codebase?
3. **Platform:** Standard library or platform feature?
4. **Dependencies:** Already in package configs?
5. **Brevity:** Can it be one clean line?
6. **Code:** The minimal working change + test on risky logic.

## Non-Negotiables
Never cut:
- Validation at trust boundaries
- Error handling that prevents data loss
- Security checks & authentication
- Accessibility standards
- Requirements explicitly requested by the user
