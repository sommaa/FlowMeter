# FlowMeter Documentation Guide

How FlowMeter's code documentation is organized, generated, and kept current.

This guide deliberately avoids file counts, percentages, and "completion"
snapshots — those go stale the moment code changes. The source of truth is
always the generated output, built from the docstrings in the code.

---

## Where documentation lives

| Audience | Source | Output |
|:---------|:-------|:-------|
| End users & operators | `README.md` (repo root) | Read directly on GitHub |
| Backend (Python) API reference | Google-style docstrings + Sphinx config in `backend/docs/` | `backend/docs/_build/html/` |
| Frontend (TypeScript/React) API reference | JSDoc comments + `frontend/typedoc.json` | `frontend/docs/` |

The two reference sites are generated from the code itself, so they reflect
whatever is currently in the source tree — there is no separately maintained
inventory to keep in sync.

---

## Backend reference (Sphinx)

See `backend/DOCS_README.md` for full setup. In short:

```bash
cd backend
pip install -r requirements.txt
pip install sphinx sphinx-rtd-theme
cd docs && make html        # output in _build/html/
```

**Module discovery is automatic.** The `services/` and `core/` pages use
recursive `autosummary` (template: `backend/docs/_templates/autosummary/module.rst`)
to walk the `app.services` and `app.core` packages. Any module added under
those packages appears in the docs on the next build with no manual edits.

The `api/` and `models/` pages additionally carry **curated tables**
(endpoint method/path lists, configuration variables, schema groupings) that
can't be derived from docstrings alone. Update those tables when endpoints or
schema groupings change.

> Recursive `autosummary` writes stub pages into
> `backend/docs/<section>/_autosummary/`. They are build artifacts and are
> gitignored — never commit them.

## Frontend reference (TypeDoc)

See `frontend/DOCS_README.md` for full setup. In short:

```bash
cd frontend
npm install
npm run docs            # output in docs/
npm run docs:serve      # build + serve on http://localhost:8080
```

TypeDoc reads every file under `src/` (excluding tests), so new components,
hooks, store slices, and types are included automatically.

---

## Documentation standards

### Python — Google-style docstrings

```python
def function_name(param1: Type, param2: Type) -> ReturnType:
    """Brief one-line description.

    More detailed description explaining purpose, algorithm, and behavior.

    Args:
        param1: Description of param1.
        param2: Description of param2.

    Returns:
        Description of what is returned.

    Raises:
        ExceptionType: When this exception is raised.
    """
```

Rendered by Sphinx's `napoleon` extension. Note that the body of `Args:`,
`Returns:`, etc. is parsed as reStructuredText — avoid Markdown-only
constructs (e.g. fenced code blocks, bare `**bold**` in odd positions) inside
docstrings, as they produce build warnings.

### TypeScript/React — JSDoc

```typescript
/**
 * Brief one-line description of the component.
 *
 * More detailed description of purpose, features, and usage.
 *
 * @param prop1 - Description of prop1
 * @returns Description of the return value
 *
 * @example
 * ```tsx
 * <Component prop1="value" />
 * ```
 */
```

---

## Keeping documentation current

When you add or change code:

1. Write/adjust the docstring or JSDoc alongside the code.
2. For the backend, no rst edits are needed for new `app.services` /
   `app.core` modules — recursive `autosummary` finds them. Only touch the
   `api/` or `models/` curated tables if endpoints or schema groups changed.
3. For the frontend, nothing to wire up — TypeDoc reads `src/` directly.
4. Rebuild (`make html` / `npm run docs`) and skim the output.

Because the reference sites are generated, the most reliable way to answer
"are the docs up to date?" is to rebuild them and read the result — not to
trust any static summary (including this one).
