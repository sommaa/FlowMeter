# Contributing to FlowMeter

Thanks for your interest in improving FlowMeter! This project is in an early
(`1.0.0-alpha.3`) public phase, so bug reports, fixes, and focused feature work are all
genuinely useful.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs & requesting features

- **Bugs / features:** open an issue using the templates under
  [New issue](https://github.com/sommaa/FlowMeter/issues/new/choose).
- **Security vulnerabilities:** do **not** open a public issue — follow the private
  process in [SECURITY.md](SECURITY.md).

## Development setup

| Tool | Minimum version | Purpose |
|:-----|:----------------|:--------|
| Python | 3.10+ | Backend runtime |
| Node.js | 18+ | Frontend toolchain |
| npm | 9+ | Package management |
| Git | any | Version control |

1. **Fork** the repository and **clone** your fork.
2. **Backend:** create a venv, activate it, then `pip install -r backend/requirements.txt`.
3. **Frontend:** `npm install` in the `frontend/` directory.
4. **Confirm a clean baseline** before you change anything:
   ```bash
   # Backend
   backend/venv/bin/python -m pytest --rootdir=backend -q

   # Frontend
   npx --prefix frontend vitest run --root frontend
   ```

## Making changes

1. Create a feature branch off `experimental`: `git checkout -b feature/my-improvement`.
2. Make your changes and **add tests** for new functionality.
3. Keep commits focused; write clear commit messages.
4. Open a Pull Request against the `experimental` branch (not `main`).

### Pull Request checklist

- [ ] Backend tests pass: `backend/venv/bin/python -m pytest --rootdir=backend -q`
- [ ] Frontend tests pass: `npx --prefix frontend vitest run --root frontend`
- [ ] No ESLint errors: `npm run lint` (from `frontend/`)
- [ ] Type check is clean: `npx tsc --noEmit` (from `frontend/`)
- [ ] New functionality includes tests
- [ ] README updated if you added a feature or configuration option

## Code standards

| Area | Configuration |
|:-----|:--------------|
| TypeScript | Strict mode (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`) |
| Target | ES2020 with bundler module resolution |
| Linting | ESLint over `ts,tsx` — `npm run lint` |
| Styling | Tailwind CSS with PostCSS; theme in `tailwind.config.js` |
| Path aliases | `@/*` → `src/*` (via `tsconfig.json`) |
| Backend style | Standard Python formatting; docstrings follow the existing convention |

### A note on formulas

FlowMeter evaluates user-supplied Python formulas through a sandbox
(`backend/app/services/formula_safety.py`). If you touch formula evaluation, keep every
user/template-facing path routed through that sandbox and add tests proving the
blacklist (e.g. `import`, dunder escapes, I/O calls) is still rejected. See
[SECURITY.md](SECURITY.md#formula-sandboxing) for the threat model.

## Branching model

- `main` — the released/public branch; protected, fast-forwarded from `experimental`.
- `experimental` — active development; **target your PRs here.**

Thanks again for contributing! 🙌
