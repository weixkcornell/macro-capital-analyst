# Macro Capital Analyst — domain pack (English summary)

> 观澜 · 宏观与资本市场分析师 —— a **zhijian-style Expert Profile v2 domain pack** for macro & A-share analysis.
> This is a short English summary. The authoritative documents are in Chinese:
> [`README.md`](README.md) (structure, version history), [`CRITERIA.md`](CRITERIA.md) (what the self-checks actually verify),
> [`RELEASING.md`](RELEASING.md) (release flow), [`SUBMISSION-CHECKLIST.md`](SUBMISSION-CHECKLIST.md) (acceptance checklist).

## What it is

A single-expert pack: one macro / A-share analyst ("观澜") with

- a **benchmark-and-objective layer** (CSI 300 as the baseline; absolute-return risk constraints),
- an **active-return framework** (active weight, active risk σ_A, Euler MCTR/CTR decomposition, E[R_A] three-way split, IR = IC × √BR, IC\*),
- **two cross-cutting gates**: Gate A (statistical credibility: BH-FDR + Bonferroni, Haircut / Deflated Sharpe, forward *and* reverse calibration) and Gate B (implementation cost & executability),
- a **six-step internalisation workflow** and a **nine-layer capability map**,
- 2 scenarios (`a-share-outlook`, `cycle-positioning`) with team templates and DAGs,
- 10 deliverable quality gates, and a self-check stack (see below).

## Layout

```
pack.json                  pack metadata (id / version / license / repository / caliber declarations)
experts/                   the expert profile (Expert Profile v2)
method-packs/              six-step internalisation, nine-layer framework, dual gates
scenarios/ + team-templates/   scenario definitions and their task DAGs
output-templates/          section structure per deliverable
quality-policies/          the 10 deliverable gates (each with an executable `config`)
data-contracts/            capability contract table for the self-built data engine
domain-knowledge/          knowledge-base ontology + snapshot (digest of SOURCE-MANIFEST)
source/SOURCE-MANIFEST.json  provenance ledger for the 38 source materials
skills/                    the framework skill (SKILL.md + references + scripts)
scripts/                   self-checks, release tooling, smoke test
CRITERIA.md                machine-verified criteria registry (generated)
```

## Self-checks (this is the part most packs omit)

```bash
bash scripts/release-check.sh        # the 5 required checks + 2 reports
node scripts/check-pack.mjs          # pack-level checks (works without the platform library)
node scripts/selftest-gates.mjs      # 46 injected-defect cases: proves each check can actually fail
node scripts/check-pack.mjs --criteria    # what is checked, and what is deliberately NOT checked
node scripts/check-pack.mjs --coverage    # which files a check reads; which are unread
```

Two properties are enforced mechanically rather than by discipline:

- **every check must be provably able to fail** — `selftest-gates.mjs` injects known defects and asserts the
  expected failure code; `check-pack` fails if any of our own codes has no such negative control;
- **"0 problems" has a declared scope** — `CRITERIA.md` lists, per criterion, the object, the scope, and
  **what is not checked**.

## Versioning

Releases are tagged `vX.Y.Z` and published as GitHub Releases. Archived snapshots are downloadable, e.g.
`https://github.com/weixkcornell/macro-capital-analyst/archive/refs/tags/v2.4.9.tar.gz`.

## Knowledge base (important)

The pack ships only the **internalised-summary layer** (the analyst's own frameworks, MIT). The 38 source
materials (copyrighted books, textbooks and papers) are **not distributed**: `materials[].fileRef` entries
resolve against a private local root declared as `fileRefRoot`, and are intentionally unresolvable in this
repository. See [`knowledge/experts/macro-capital-analyst/README.md`](knowledge/experts/macro-capital-analyst/README.md)
for how to build your own knowledge base.

## License

MIT (see [`LICENSE`](LICENSE)). Source materials remain the property of their authors/publishers.
