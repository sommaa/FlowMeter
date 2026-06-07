# Example dataset & dashboard template

This folder contains a ready-to-use example so you can explore FlowMeter without
preparing your own data first.

| File | What it is |
|:-----|:-----------|
| `Ethylene_Cracker_Process_Data.xlsx` | A synthetic process dataset — 336 hourly samples (14 days) × 40 tags from an ethylene cracker: feed/steam rates, reactor temperatures and pressures, yields, compressor health, product slate, utilities, and emissions. |
| `Ethylene Cracker Overview.json` | A dashboard template built for that dataset: 8 visualizations (reactor overview, product-slate area chart, mass-balance and specific-energy formulas, compressor health monitor, COT→ethylene-yield regression, correlation matrix, cooling-water FFT), 4 computed global variables, column descriptions, and AI guidance. |

The template's required columns match the dataset exactly, so it applies cleanly
with no extra setup.

## How to use it

1. Launch FlowMeter (see the [Quick Start](../README.md#quick-start) in the main README).
2. **Upload the data:** drag `Ethylene_Cracker_Process_Data.xlsx` onto the upload
   zone (or click to browse). FlowMeter detects the `Timestamp` column and the 39
   numeric tags automatically.
3. **Apply the template:** in the onboarding wizard choose **Import Template**, or
   open the **Templates** panel in the sidebar, and select
   `Ethylene Cracker Overview.json`. The full dashboard renders immediately.

> [!TIP]
> To have the template show up automatically in the **Templates** list on every
> launch (instead of importing it each time), copy it into the backend's template
> directory:
> ```bash
> cp "examples/Ethylene Cracker Overview.json" backend/data/templates/
> ```
> That directory is git-ignored (it holds your personal saved templates), which is
> why the canonical copy of the example lives here in `examples/`.

## Use it as a starting point

These two files double as a reference for the expected shapes:

- **Dataset** — a wide table with one timestamp column plus one numeric column per
  tag, one row per time point. Swap in your own export with the same layout.
- **Template** — open the `.json` to see how visualizations, formulas, global
  variables, and AI guidance are structured before authoring your own.
