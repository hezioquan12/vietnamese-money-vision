---
name: ponytail-gain
description: >-
  Show ponytail's measured savings and benchmark scoreboard (less code, less cost, more speed).
  One-shot display. Use for /ponytail-gain, "what does ponytail save", "ponytail impact".
---

# Ponytail Gain — Impact Scoreboard

Displays the empirical benchmark performance of the Ponytail methodology.
One-shot reference display: does not edit files or modify session mode.

## Benchmark Context
The figures below reflect published agentic benchmarks of Ponytail 5:
Headless evaluation across 39 real-world tasks (FastAPI + React features, bug fixes, security & privacy tasks, small utilities), 5 runs each, comparing identical agents with and without the Ponytail skill.

## Scoreboard

```text
  ponytail gain           benchmark · 39 tasks × 5 runs · Opus 5.5

  no-skill (baseline)     ████████████████████  100%
  Lines of code           █████████···········   47%   ▼ 53%
  Output tokens           ███████████·········   55%   ▼ 45%
  Cost                    ███████████████·····   74%   ▼ 26%
  Time                    ████████████········   59%   ▼ 41%
  Hidden checks passed    97%  (vs no-skill 96%)
  Tests for risky logic   98%  (vs no-skill 68%)

  Active project actions:
  - Run `/ponytail-debt`  to audit deferred shortcut comments
  - Run `/ponytail-audit` to identify cuttable bloat in this repo
```

## Honesty Boundary
These numbers are geometric mean benchmark averages across standardized tasks, not arbitrary calculations from the current workspace. Real repository metrics come from concrete debt counts (`/ponytail-debt`) and targeted audits (`/ponytail-audit`).
