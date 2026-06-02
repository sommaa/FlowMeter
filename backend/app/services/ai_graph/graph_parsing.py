"""Content / JSON parsing helpers for the AI workflow.

Extracted from ``graph.py`` so the workflow module stays focused on
state-machine nodes. Helpers (``_content_to_text``, ``_parse_json_response``,
``_parse_suggestion``, ``_looks_truncated``, plus the smaller utilities they
compose) are re-exported from ``graph`` for backward compatibility.
"""

import hashlib
import json
import logging
import re

from .schemas import (
    AdditionalConfig,
    FormulaConfig,
    VisualizationSuggestion,
)

logger = logging.getLogger(__name__)


def _content_to_text(content) -> str:
    """Normalize a LangChain message content payload to a plain text string.

    Handles three shapes:

    - Plain string (standard Chat Completions, no thinking): returned verbatim.
    - List of content blocks with ``type: "text"`` (Anthropic extended-
      thinking responses): concatenate the text blocks.
    - List of output items from OpenAI's Responses API (used for reasoning-
      tier models): each item has ``type: "reasoning" | "message" |
      "function_call" | …``. ``"message"`` items wrap their text in
      ``content: [{"type": "output_text", "text": ...}]`` — extract that.
      ``"reasoning"`` items are internal scratch and are skipped.

    Falling through to ``str(content)`` would dump the raw block dicts into
    the JSON parser, which then sees a list of structural metadata and
    cannot extract usable suggestion content.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                btype = block.get("type")
                # Chat Completions / Anthropic text block.
                if btype == "text" and isinstance(block.get("text"), str):
                    parts.append(block["text"])
                # Responses API: a top-level "message" item carries its own
                # nested content array of output_text blocks.
                elif btype == "message":
                    for inner in block.get("content", []) or []:
                        if isinstance(inner, dict):
                            inner_type = inner.get("type")
                            if (
                                inner_type in ("output_text", "text")
                                and isinstance(inner.get("text"), str)
                            ):
                                parts.append(inner["text"])
                # Responses API: a bare output_text block (some wrappers
                # flatten the message) — accept it directly.
                elif btype == "output_text" and isinstance(block.get("text"), str):
                    parts.append(block["text"])
                # "reasoning", "thinking", "function_call" — internal/structural,
                # don't dump them into the text payload.
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts) if parts else str(content)
    return str(content)


# Strip trailing commas before a closing ``]`` or ``}``. Gemini in particular
# emits ``"y_axes": ["a", "b",]`` and ``[{...},]`` which strict ``json.loads``
# rejects. The regex tolerates whitespace and any number of nested closures
# in sequence (``,]}``).
_TRAILING_COMMA_RE = re.compile(r',(\s*[\]}])')


def _clean_json_text(text: str) -> str:
    """Best-effort cleanup of common LLM JSON-format errors.

    Today: strip trailing commas before ``]``/``}``. Kept as a function so
    future cleanup rules (e.g. unescaped newlines inside strings) attach
    here rather than scattering through ``_parse_json_response``.
    """
    if not text:
        return text
    return _TRAILING_COMMA_RE.sub(r'\1', text)


def _try_loads_lenient(text: str):
    """``json.loads`` with one retry after ``_clean_json_text``.

    Returns the parsed Python value on success, or ``None`` if both attempts
    fail. ``None`` is unambiguous here because real LLM responses parse to
    lists or dicts, never to bare ``None``.
    """
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    cleaned = _clean_json_text(text)
    if cleaned == text:
        return None
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def _unwrap_to_list(data) -> list[dict] | None:
    """Normalize a parsed JSON value to a list of suggestion-shaped dicts.

    Accepted shapes:
      - ``[{...}, ...]``                  → returned as-is
      - ``{"suggestions": [{...}, ...]}`` → inner list returned
      - ``{...}``  (single suggestion)    → wrapped as ``[{...}]``

    Returns ``None`` if ``data`` is not parseable into a suggestion list
    (e.g. a list of bare strings, which previously slipped through the
    bracket-scan fallback and caused confusing downstream errors).
    """
    if isinstance(data, list):
        if not data:
            return data
        if all(isinstance(item, dict) for item in data):
            return data
        return None
    if isinstance(data, dict):
        if 'suggestions' in data and isinstance(data['suggestions'], list):
            inner = data['suggestions']
            if not inner or all(isinstance(item, dict) for item in inner):
                return inner
            return None
        return [data]
    return None


def _looks_truncated(content: str) -> bool:
    """Heuristic: does ``content`` look like a JSON emission cut off mid-output?

    True for typical Gemini-3.x token-cap exhaustion: an unmatched opening
    fence, more ``{``/``[`` than ``}``/``]``, or a final character that
    indicates a partially-emitted token (``"``, ``:``, ``,``). The check is
    intentionally lenient — false positives only change the error message
    shape, not behavior. Empty content is not "truncated"; it's empty.
    """
    if not content:
        return False
    stripped = content.strip()
    if not stripped:
        return False
    # Open fence without matching close.
    open_fences = stripped.count("```")
    if open_fences and open_fences % 2 == 1:
        return True
    # Bracket imbalance.
    if stripped.count("{") > stripped.count("}"):
        return True
    if stripped.count("[") > stripped.count("]"):
        return True
    # Final char hints at a partial token.
    if stripped[-1] in ('"', ':', ','):
        return True
    return False


def _parse_json_response(content) -> list[dict]:
    """Parse JSON from LLM response, handling various formats.

    Strategies (in order):
      1. Direct ``json.loads`` on the whole content.
      2. Strip markdown fences (open ``` ``` `` with optional ``json`` tag and
         either a matching close or end-of-string for truncated responses).
         Re-parse the inner payload.
      3. Backward scan from the last ``]`` to the matching ``[`` for content
         that mixes prose and JSON. Only accepts the result if every element
         is a dict — prevents grabbing an inner ``y_axes: [...]`` array when
         the outer object is malformed (a real failure mode observed with
         Gemini-emitted trailing commas).

    All strategies route through ``_try_loads_lenient`` so a single trailing
    comma doesn't kill an otherwise-recoverable response.
    """
    # Normalize content from list-of-blocks (Anthropic extended thinking) to text
    content = _content_to_text(content)
    if not content:
        return []

    # Strategy 1 — direct parse.
    parsed = _try_loads_lenient(content)
    if parsed is not None:
        out = _unwrap_to_list(parsed)
        if out is not None:
            return out

    # Strategy 2 — strip markdown fences. The close-fence is optional so a
    # stream that cut off before emitting the closing ``` ``` `` still gets
    # its (incomplete) payload tried. Capture group is non-greedy to handle
    # multiple fences in a single response.
    fence_re = re.compile(r'```(?:json|JSON)?\s*([\s\S]*?)(?:```|\Z)')
    for fence_match in fence_re.finditer(content):
        inner = fence_match.group(1)
        parsed = _try_loads_lenient(inner)
        if parsed is None:
            continue
        out = _unwrap_to_list(parsed)
        if out is not None:
            return out

    # Strategy 3 — backward bracket scan. Restrict to results whose elements
    # are all dicts so a malformed outer suggestion list doesn't degrade into
    # a bare-string array grabbed from a nested ``y_axes``.
    end = content.rfind(']')
    if end != -1:
        depth = 0
        for i in range(end, -1, -1):
            if content[i] == ']':
                depth += 1
            elif content[i] == '[':
                depth -= 1
                if depth == 0:
                    parsed = _try_loads_lenient(content[i:end+1])
                    if parsed is not None:
                        out = _unwrap_to_list(parsed)
                        if out is not None:
                            return out
                    break

    # All strategies failed. Emit a WARNING with a content preview + hash so
    # repeated identical failures dedupe in log aggregators. Without this,
    # parse failures returned silently as ``[]`` looked indistinguishable
    # from a model that produced no suggestions.
    preview = content[:200].replace("\n", "\\n")
    content_hash = hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest()[:12]
    logger.warning(
        "Failed to parse JSON from LLM response (len=%d, hash=%s): %r",
        len(content),
        content_hash,
        preview,
    )
    return []


def _parse_suggestion(raw: dict) -> VisualizationSuggestion:
    """Parse a raw dictionary into a validated VisualizationSuggestion.

    Handles the nested ``additional_config``/``formula`` shapes the LLM
    sometimes emits (formula as bare string vs. dict, missing additional_config,
    etc.). Required fields are passed through to Pydantic so its validation
    surface remains the source of truth for missing-field errors.

    Raises ``ValueError`` when ``raw`` is not a dict (model occasionally emits
    a bare string array under heavy tool-use context) and ``ValidationError``
    on Pydantic-level failures.
    """
    if not isinstance(raw, dict):
        preview = repr(raw)
        if len(preview) > 200:
            preview = preview[:197] + "…"
        raise ValueError(
            f"Suggestion must be a JSON object, got {type(raw).__name__}: {preview}"
        )

    additional = raw.get('additional_config', {})
    if isinstance(additional, dict):
        if 'formula' in additional:
            formula_val = additional['formula']
            if isinstance(formula_val, str) and formula_val.strip():
                additional['formula'] = FormulaConfig(input=formula_val)
            elif isinstance(formula_val, dict):
                additional['formula'] = FormulaConfig(**formula_val)
            else:
                additional.pop('formula', None)
        additional = AdditionalConfig(**additional)
    else:
        additional = AdditionalConfig()

    kwargs: dict = {'additional_config': additional}

    for field in ('title', 'description', 'viz_type', 'x_axis', 'y_axes', 'confidence', 'reasoning'):
        if field in raw:
            kwargs[field] = raw[field]

    for field in ('x_label', 'y_label', 'plot_type', 'legend_labels'):
        if field in raw:
            kwargs[field] = raw[field]

    return VisualizationSuggestion(**kwargs)
