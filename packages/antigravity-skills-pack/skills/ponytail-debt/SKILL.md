---
name: ponytail-debt
description: >-
  List every `shortcut:` and `ponytail:` comment as a tracked debt ledger so deliberate shortcuts
  do not silently rot. One-shot report, changes nothing. Use for "ponytail debt", "what did ponytail defer",
  "list the shortcuts", /ponytail-debt.
---

# Ponytail Debt Ledger

Harvests deliberate shortcuts marked with `shortcut:` (or legacy `ponytail:`) comments into a single debt ledger, preventing temporary deferrals from quietly becoming permanent technical debt.

## Scanning the Codebase

Search the codebase for shortcut annotations, ignoring version control, build outputs, and ignored files.

### Recommended Scan Commands
Execute via `run_command`:

**Git Grep (Primary):**
```bash
git grep --no-index --exclude-standard -nE "(#|//|/\*) ?(shortcut|ponytail):"
```

**Custom Marker (if specified by user, e.g. `/ponytail-debt TODO`):**
```bash
git grep --no-index --exclude-standard -nE "(#|//|/\*) ?TODO:"
```

**PowerShell Fallback (Windows without Git):**
```powershell
Get-ChildItem -Recurse -File -Exclude "*.git*", "*build*", "*node_modules*" | Select-String -Pattern "(#|//|/\*)\s*(shortcut|ponytail):"
```

Filter out false positives (e.g., UI comments discussing keyboard shortcuts).

## Ledger Output Format

Group results by file path:

```markdown
### `path/to/file.ext`
- **Line [L]**: [What was simplified]
  - **Ceiling**: [Maximum supported limit before breaking]
  - **Upgrade Trigger**: [Condition when this must be upgraded]
  - *Status*: `tracked` OR `no-trigger` ⚠️ (rot risk)
```

### Rot Risk Tagging
Any shortcut marker missing an explicit upgrade path or condition receives a `no-trigger` warning tag, as unanchored shortcuts inevitably rot.

### Summary
Conclude with:
`[N] markers found, [M] with no trigger.`
If no markers are found:
`No shortcut debt. Clean ledger.`

Read-only analysis. If the user requests persistence, offer to save the ledger to `PONYTAIL-DEBT.md`.
