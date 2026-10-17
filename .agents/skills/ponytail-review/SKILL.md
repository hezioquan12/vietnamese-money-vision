---
name: ponytail-review
description: >-
  Quality review of a change: is the logic right, is it safe, does it hold under real load,
  is risky code tested, is it fast enough, and is every line needed. Reads the connected code,
  not only the diff. Use for "review this", "code review", "review the last commit",
  "review my PR", "is this over-engineered", /ponytail-review.
---

# Ponytail Review

Review a change like the senior developer who will be paged when it breaks.
Order of importance: **correct > safe > holds under load > tested > fast > lean**.
Lean still matters: every extra line must be read, tested, and fixed later.
This is a report the user asked for, so give it in full without altering code.

## 1. Understand First

- Review what the user names: uncommitted or staged changes, a branch, a PR link, or specific files.
  - If nothing is named, review uncommitted changes via `git status` / `git diff`, or the last commit (`git show`) if working tree is clean.
- Read the diff, then read the surrounding code it touches using file viewing tools:
  - Callers of every changed function.
  - Functions it calls.
  - Associated tests and configurations.
- Trace the real flow: where data enters, what is transformed or stored, and what exits.
- Check cross-file breakage: when a signature, return value, or behavior changes, grep every caller.
- Determine the expected load in the repo (README, deploy config, architecture): single-user local app, background job, or high-concurrency service. Judge scale against that and state your assumption.

## 2. Review Checklist

1. **Bug:** Wrong result, crash, missed edge cases (null/nil, empty, zero, boundary index, floating-point rounding, timezone issues), broken callers, partial fixes where shared code remains broken.
2. **Risk:** Security vulnerabilities (injection, weak crypto/secrets, unvalidated input), data corruption or loss (swallowed exceptions, unhandled race conditions, missing transactions).
3. **Scale:** Check-then-write races, redundant queries or loops in hot paths, unbounded memory/cache growth, $O(n^2)$ bottlenecks on user data.
4. **Missing Test:** Risky new logic (branches, parsers, state transitions, financial/security logic) without an automated test that fails if broken.
5. **Speed:** Meaningful performance regressions or unnecessary work repeated inside loops.
6. **Lean (Eliminate Bloat):**
   - **Delete:** Dead code, unused flags, speculative features.
   - **Reuse:** Existing project helpers and components (cite file and line).
   - **Native/Platform:** Standard library or platform API already does this; unnecessary new dependency.
   - **YAGNI:** Single-implementation interfaces, single-product factories, pass-through boilerplate.
   - **Merge:** Duplicated near-identical logic.
   - **Split:** Monolithic functions doing unrelated jobs (split by responsibility, never just by line count).

## 3. Verification Rules

- Every finding must cite a concrete failure scenario: "input X or situation Y leads to outcome Z". No speculative worries without a tangible case.
- Confirm code references: verify callers exist, values can realistically be null, or code is genuinely unreferenced.
- Respect intentional shortcuts: Comments matching `shortcut: <ceiling>, <upgrade>` are documented decisions, not defects, unless current load already breaches the ceiling.
- Recommend the smallest possible fix (preferring deletion).
- Skip pure cosmetic or subjective style opinions.

## 4. Output Report Structure

Use clear, concise language.

1. **Summary:**
   `What this change does:` (2-3 sentences explaining the intent and behavior).
   `Assumed load:` (e.g. Android client app, single active user).

2. **Ranked Findings:**
   Group findings into three categories (skip empty categories), numbered sequentially:
   - **Must fix:** Bug, security vulnerability, data loss, breaks expected load.
   - **Should fix:** Untested risky logic, real performance lag, duplication, unjustified bloat.
   - **Nice to have:** Micro-optimizations, cleaner one-line equivalents.

   Each finding must follow this 4-part format:
   ```markdown
   [N]. **[Short descriptive title]** (`path/to/file:L10-25`)
      - **What this is:** What this code does in 1 sentence.
      - **Problem:** The concrete failure case and why it breaks.
      - **Fix:** The smallest code fix (prefer 1-2 lines or deletion).
      - **If we skip it:** The exact consequence if left unfixed.
   ```

3. **Conclusion:**
   - `Verdict:` `Ship.` OR `Fix [numbers] first.`
   - `Lean:` `-[N] lines possible.` (if bloat was found).
   - `Not checked:` Any areas not inspected or unverified.
