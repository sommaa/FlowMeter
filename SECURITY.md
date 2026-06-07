# Security Policy

## Supported versions

FlowMeter is pre-1.0 software (`1.0.0-alpha`). Security fixes are applied to the
latest release on the `main` branch only.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for a
suspected vulnerability.

- Use GitHub's **[Report a vulnerability](https://github.com/sommaa/FlowMeter/security/advisories/new)**
  (Security → Advisories) to open a private advisory, or
- Open a regular issue **only** if it contains no exploit details, asking a maintainer
  to contact you.

Please include the version, your platform, reproduction steps, and impact. We aim to
acknowledge reports within a few days. As an unfunded open-source project there is no
formal SLA, but we will work with you on a coordinated disclosure.

## Threat model — read this before deploying

FlowMeter is a **local, single-user desktop application**. Its security design assumes
it runs on the analyst's own machine and that the person using it is the data owner.

- **No authentication or authorization.** Anyone who can reach the HTTP port has full
  access to every loaded dataset and to all functionality.
- **Do not expose FlowMeter on a shared or public network, and do not deploy it as a
  multi-user / internet-facing service.** It is not hardened for that and has no access
  control.
- The default bind address is `HOST=0.0.0.0`, which listens on **all** network
  interfaces. If your machine is on an untrusted network, set `HOST=127.0.0.1` in
  `backend/.env` so the app is reachable only from localhost.
- Uploaded data is held **in memory** and is not persisted or sent anywhere; templates
  you save are written as JSON under `backend/data/templates/`.

## Formula sandboxing

Charts, global variables, KPIs and custom regression models accept user-supplied Python
formulas (e.g. `result = col['a'] / col['b']`). Because templates are shareable files,
these formulas are treated as untrusted input and are evaluated through a sandbox
(`backend/app/services/formula_safety.py`) that:

- rejects `import` statements and access to dunder attributes
  (`__class__`, `__globals__`, …), blocking the usual sandbox-escape tricks;
- restricts function calls to a vetted numeric whitelist, so I/O-capable calls such as
  `np.load` or `pd.read_pickle` are refused (Series/DataFrame math methods like
  `.rolling().mean()` remain available);
- evaluates with a locked-down `__builtins__`, so `open`, `__import__`, `eval`, `exec`,
  and similar builtins are not present.

Formulas are validated both when a template is imported/saved and again at render time.
Even so, **only import templates from sources you trust** — sandboxes reduce, but never
fully eliminate, the risk of running someone else's code.

If you find a way to execute arbitrary code, read files, or make network requests
through a formula, please report it via the process above.
