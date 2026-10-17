---
name: ponytail-audit
description: >-
  Quality audit of an entire codebase or repository: bugs, security holes, load bottlenecks,
  risky code without tests, slow paths, and bloat to delete, merge, or split. Ranked report,
  changes nothing. Use for "audit this codebase", "review the whole repo", "find bloat",
  "what can I delete", /ponytail-audit.
---

# Ponytail Audit

Audit the repository like a senior developer who just inherited the project and will be paged when it breaks.
Order of importance: **correct > safe > holds under load > tested > fast > lean**.
Lean still matters: every extra line must be read, tested, and maintained.
This is a read-only audit report; do not modify code.

## 1. Map the Codebase First

- Target: Audit what the user specifies (a directory, module, or the entire repository).
- Read foundational files: README, build and dependency configs (`build.gradle`, `package.json`, etc.), entry points (activities, routes, services, handlers), and test suites.
- Identify the runtime model: e.g., Android mobile app, background service, client-server sync. State the assumed operating context.
- Trace critical paths end-to-end:
  - User input handling
  - Data persistence & database queries
  - Network requests & state synchronization
  - Authentication and sensitive data handling
- On large repositories, focus deep dives where bugs cost the most. Explicitly declare any uninspected modules.

## 2. Audit Vectors

1. **Bugs:** State mismatches, crashes, edge case omissions (empty lists, unhandled nullability, lifecycle edge cases), inconsistent business rules between modules.
2. **Security & Data Safety:** Secret leakage, insecure storage, unprotected inputs, swallowed exceptions, non-transactional database updates.
3. **Scale & Concurrency:** UI thread blocking, unthrottled background syncs, memory leaks (unclosed streams, static context references), unbounded list allocations.
4. **Missing Tests:** Complex business logic, state machines, or parsing routines lacking automated regression tests.
5. **Performance:** Heavy operations in hot paths or render loops.
6. **Bloat (Lean Opportunities):**
   - **Delete:** Dead code, obsolete configs, unused feature flags, speculative helper methods.
   - **Reuse:** Duplicate utility functions or redundant widgets.
   - **Native/Platform:** Heavy 3rd-party dependencies when the platform SDK or standard library provides native solutions.
   - **YAGNI:** Over-abstracted patterns (interfaces with only 1 implementation, excessive indirection).

## 3. Reporting Standards

- Every finding must include a concrete reproducer or failure scenario.
- Verify before reporting: grep the tree to ensure "unused" code is not dynamically referenced or used in tests/build scripts.
- Respect `shortcut: <ceiling>, <trigger>` annotations unless the ceiling is already violated.
- Propose minimal, deletion-preferred remedies.

## 4. Audit Output Format

1. **Overview:**
   `What this codebase does:` (2-3 sentences).
   `Assumed load / context:` (e.g., Mobile client environment).

2. **Ranked Findings (Max 20):**
   Numbered sequentially across groups:
   - **Must fix:** Bugs, security flaws, data loss risks.
   - **Should fix:** Untested risky logic, memory/performance issues, high duplication, obvious bloat.
   - **Nice to have:** Minor simplifications and cleanups.

   Each item follows:
   ```markdown
   [N]. **[Concise Headline]** (`path/to/file:L10-25`)
      - **What this is:** Role of this code component.
      - **Problem:** Concrete issue and how it manifests.
      - **Fix:** Smallest working remedy (preferring deletion/reuse).
      - **If we skip it:** Practical impact if ignored.
   ```

3. **Verdict & Score:**
   - `Verdict:` `Healthy. Nothing to fix.` OR list of top priorities (e.g. `Fix 1 and 3 first.`).
   - `Lean:` `-[N] lines, -[M] dependencies possible.`
   - `Not checked:` Sections or packages not audited.
