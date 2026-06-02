"""
Centralized prompt templates for AI visualization suggestions.

Provides system prompts, user prompts, and correction prompts
with comprehensive instructions for professional output.

The system, user, and correction prompts are stored as Jinja2 templates
(`system.j2`, `user.j2`, `correction.j2`) alongside this module. The Python
functions below are thin wrappers that build the rendering context and
delegate to the template engine. This keeps the prompt text editable as
plain `.j2` files (good for diffing and review) while letting the call
sites stay structured.
"""

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

# Module-scope Jinja environment — loads templates from this package's directory.
# autoescape=False: prompts aren't HTML; the `<column_description>` and
# `<user_guidance>` XML tags from Sprint 1's input-trust rules must pass
# through verbatim, not get HTML-escaped to `&lt;...&gt;`.
# StrictUndefined: a missing context key raises an error at render time
# rather than silently substituting empty strings — catches bugs loudly.
# keep_trailing_newline=True: the original f-string-based prompts ended in a
# trailing newline; preserve byte-identical output.
_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent),
    autoescape=False,
    undefined=StrictUndefined,
    keep_trailing_newline=True,
)


def get_system_prompt(reasoning_max_chars: int = 800, dataset_access: bool = False) -> str:
    """Build the comprehensive system prompt for AI visualization suggestions.

    Constructs a detailed system prompt that instructs the AI model on how
    to generate high-quality visualization suggestions. The prompt includes
    role definition, visualization type descriptions, output guidelines,
    and validation rules.

    The default upper bound matches the `reasoning` field's `max_length` in
    `schemas.VisualizationSuggestion`. Telling the model a higher cap than
    the schema enforces just churns the schema-correction loop.

    Args:
        reasoning_max_chars: Cap on the ``reasoning`` field length advertised
            to the model (matches schema validation).
        dataset_access: When True, includes a tool-use instruction block
            telling the model it may call dataset-inspection tools before
            producing the final suggestions JSON.

    Returns:
        The complete system prompt string to be used with the LLM.
    """
    return _env.get_template("system.j2").render(
        reasoning_max_chars=reasoning_max_chars,
        dataset_access=dataset_access,
    )


def get_user_prompt(
    columns: list[dict],
    guidance_text: str,
    available_viz_types: list[str],
    existing_visualizations: list[str],
    max_suggestions: int = 5,
    reasoning_max_chars: int = 800,
) -> str:
    """Build the user prompt containing dataset context and analysis goals.

    The pre-formatting steps (column lines, datetime hint, existing-list)
    stay in Python because they involve conditional logic; the template
    just substitutes the resulting strings into the structured prompt body.

    Args:
        columns: List of column metadata dictionaries.
        guidance_text: User's analysis goals or questions in free text.
        available_viz_types: List of visualization types the system supports.
        existing_visualizations: Titles of charts already created.
        max_suggestions: Maximum number of suggestions to request.

    Returns:
        The formatted user prompt string.
    """
    # Format columns. User-supplied descriptions are wrapped in XML tags so the
    # model treats them as data, per the "Input Trust Rules" in the system prompt.
    columns_text = "\n".join([
        f"- **{col['name']}** ({col['data_type']}): "
        f"<column_description>{col.get('description', 'No description')}</column_description>"
        + (f" [Unit: {col['unit']}]" if col.get('unit') else "")
        + (f" [Role: {col['role']}]" if col.get('role') else "")
        for col in columns
    ])

    # Surface datetime columns explicitly so the AI uses them as x_axis for time-series
    datetime_cols = [c['name'] for c in columns if c.get('data_type') == 'datetime']
    if datetime_cols:
        datetime_hint = (
            f"\n\n## Timeline Columns (datetime)\n"
            f"{', '.join(datetime_cols)}\n"
            f"Use one of these as `x_axis` for any time-series visualization "
            f"(universal, area, box, fft, regression over time). When multiple "
            f"datetime columns exist, default to the first one above."
        )
    else:
        datetime_hint = "\n\n## Timeline Columns (datetime)\nNone — choose a numeric x_axis where needed."

    # Format existing visualizations
    existing_text = ""
    if existing_visualizations:
        existing_text = "\n\n## Already Created (avoid duplicating):\n- " + "\n- ".join(existing_visualizations)

    return _env.get_template("user.j2").render(
        columns_text=columns_text,
        datetime_hint=datetime_hint,
        existing_text=existing_text,
        guidance_text=guidance_text,
        max_suggestions=max_suggestions,
        viz_types=", ".join(available_viz_types),
        reasoning_max_chars=reasoning_max_chars,
    )


def get_correction_prompt(
    original_suggestion: dict,
    errors: list[str],
    valid_columns: list[str],
    reasoning_max_chars: int = 800,
) -> str:
    """Build a correction prompt for fixing invalid visualization suggestions.

    Args:
        original_suggestion: The suggestion dict that failed validation.
        errors: List of validation error messages to be resolved.
        valid_columns: List of valid column names. First 20 are surfaced.

    Returns:
        The formatted correction prompt requesting a single fixed JSON object.
    """
    errors_text = "\n".join([f"- {e}" for e in errors])
    columns_text = ", ".join(valid_columns[:20])  # Limit for prompt size
    if len(valid_columns) > 20:
        columns_text += f", ... ({len(valid_columns) - 20} more)"

    return _env.get_template("correction.j2").render(
        original_suggestion=original_suggestion,
        errors_text=errors_text,
        columns_text=columns_text,
        reasoning_max_chars=reasoning_max_chars,
    )
