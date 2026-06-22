# Changelog

All notable changes to FlowMeter are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.3] — 2026-06-22

### Added
- **Opt-out for the formula sandbox.** A new **Allow unsafe formulas** setting
  (Settings ▸ Security) lets you disable formula safety so trusted templates with
  non-whitelisted formulas can be imported, saved, and rendered. It is **off by
  default**, persisted locally, and mirrored to the backend on startup. When an
  import is blocked, an **"Enable unsafe formulas & retry"** prompt offers to turn
  it on and re-run the import. Exposed at runtime via `GET`/`PUT
  /api/v1/settings/security`, seeded by the `ALLOW_UNSAFE_FORMULAS` setting.

### Fixed
- **Startup sync no longer crashes the app under test mocks.** The formula-safety
  preference is read from `localStorage` on startup instead of the store.

## [1.0.0-alpha.2] — 2026-06-14

### Fixed
- **Root-cause settings panel no longer crashes** when a dashboard template carries a
  visualization with `viz_type: root_cause` but no `root_cause` configuration object.
  Opening that visualization's config panel dereferenced an undefined value
  (`rc is undefined`); it now falls back to sensible defaults and stays editable.

## [1.0.0-alpha] — 2026-06-07

First public pre-release. FlowMeter is a local, single-user desktop application for
importing, cleaning, visualizing, and analyzing industrial process time-series data —
a FastAPI backend and a React/Vite frontend packaged as a single executable.

### Features
- Data import from Excel (`.xlsx`/`.xls`), CSV, and Parquet (`.parquet`/`.pqt`).
- Visualizations: line/scatter/bar trends, formula plots, KPIs, FFT, regression
  (linear/ridge/lasso/random-forest/custom), root-cause analysis, and more.
- Custom formula engine for global variables, chart formulas, and KPIs.
- Data reconciliation via quadratic programming (OSQP).
- Dashboard templates: save, reuse, and share complete configurations as JSON.
- Optional AI-assisted chart suggestions (Anthropic / OpenAI / Google providers).
- Report/data export; local-only processing with no cloud dependencies.

### Security
- Formula evaluation is sandboxed (`backend/app/services/formula_safety.py`): all
  user- and template-supplied formulas are checked for imports, dunder access, and
  non-whitelisted calls, and run with a locked-down `__builtins__`. This closes an
  arbitrary-code-execution path through shared dashboard templates. Templates are
  validated on import/save and again at render time.
- API keys are redacted from logs by a logging filter.
- Added `SECURITY.md` documenting the local-only threat model (no authentication; do
  not deploy as a multi-user/internet-facing service).

### Internal
- Replaced ad-hoc `print()` debugging with the `logging` module across the backend.
- Added a working ESLint (flat) configuration and fixed a TypeScript build error so
  `npm run lint`, `tsc`, and `npm run build` all pass.
- Added GitHub Actions CI (backend tests + frontend lint/typecheck/test/build) and a
  tag-triggered release workflow that builds the Windows and Linux executables.
- Removed dead legacy plotting code.

[1.0.0-alpha.3]: https://github.com/sommaa/FlowMeter/releases/tag/v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/sommaa/FlowMeter/releases/tag/v1.0.0-alpha.2
[1.0.0-alpha]: https://github.com/sommaa/FlowMeter/releases/tag/v1.0.0-alpha
