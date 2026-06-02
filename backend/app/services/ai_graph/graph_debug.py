"""Structured debug logger for the AI suggestion workflow.

Extracted from ``graph.py`` so the workflow module stays focused on the
state machine. ``DebugLevel``, ``AIDebugLogger``, and the module-level
``debug`` instance are re-exported from ``graph`` for backward
compatibility with existing imports.

Per-request timers (``_workflow_start_time``/``_phase_start_time``) live
in ``ContextVar``s rather than instance attributes — concurrent FastAPI
requests run in separate asyncio tasks, and ContextVars scope per task,
so each request sees its own timer values.
"""

import logging
import time
from contextvars import ContextVar
from typing import Optional

from ._debug import get_debug_level

logger = logging.getLogger(__name__)


# ============= Debug Configuration =============


class DebugLevel:
    """Debug verbosity levels for AI suggestion workflow."""
    OFF = 0       # No debug output
    SUMMARY = 1   # Phase transitions and final results
    STANDARD = 2  # + Suggestion details and validation results
    VERBOSE = 3   # + Full prompts and LLM responses
    TRACE = 4     # + State snapshots and every function call


# Per-request timers. The module exposes a single ``debug`` instance for
# convenience, but multiple concurrent requests share that instance — if
# the timers lived on ``self``, two requests entering ``phase_start`` at
# nearly the same time would overwrite each other's ``_phase_start_time``
# and report nonsense elapsed values. ContextVars scope per asyncio task
# (one task per FastAPI request) so each request gets its own timers.
_workflow_start_time: ContextVar[Optional[float]] = ContextVar(
    "_workflow_start_time", default=None
)
_phase_start_time: ContextVar[Optional[float]] = ContextVar(
    "_phase_start_time", default=None
)


class AIDebugLogger:
    """Structured debug logging for the AI suggestion workflow.

    Hierarchical output for understanding the pipeline at various detail
    levels. The debug level is read dynamically from ``AI_DEBUG_LEVEL`` on
    every call so verbosity can be changed at runtime.

    Per-request timers (``workflow_start``/``phase_start``) live in
    ``ContextVar``s rather than instance attributes so concurrent requests
    can't overwrite each other's elapsed measurements.
    """

    PREFIX = "[AI-DEBUG]"
    LINE_SINGLE = "-" * 70
    LINE_DOUBLE = "=" * 70

    @property
    def level(self) -> int:
        """Read debug level dynamically from environment."""
        return get_debug_level()

    def _log(self, msg: str, min_level: int = DebugLevel.SUMMARY) -> None:
        """Internal logging method."""
        if self.level >= min_level:
            for line in msg.split('\n'):
                logger.info(f"{self.PREFIX} {line}")

    def workflow_start(self, provider: str, model: str, guidance: str, num_columns: int) -> None:
        """Log the start of a workflow run."""
        if self.level < DebugLevel.SUMMARY:
            return
        _workflow_start_time.set(time.time())
        self._log(self.LINE_DOUBLE)
        self._log("[START] AI SUGGESTION WORKFLOW STARTED")
        self._log(self.LINE_SINGLE)
        self._log(f"  Provider: {provider}")
        self._log(f"  Model: {model or 'default'}")
        self._log(f"  Columns: {num_columns}")
        self._log(f"  Guidance: {guidance[:100]}..." if len(guidance) > 100 else f"  Guidance: {guidance}")
        self._log(self.LINE_DOUBLE)

    def workflow_end(self, num_validated: int, num_errors: int) -> None:
        """Log the end of a workflow run."""
        if self.level < DebugLevel.SUMMARY:
            return
        start = _workflow_start_time.get()
        elapsed = time.time() - start if start is not None else 0
        self._log(self.LINE_DOUBLE)
        self._log(f"[OK] WORKFLOW COMPLETE in {elapsed:.2f}s")
        self._log(f"  Validated suggestions: {num_validated}")
        self._log(f"  Validation errors: {num_errors}")
        self._log(self.LINE_DOUBLE)

    def phase_start(self, phase_name: str, context: Optional[dict] = None) -> None:
        """Log the start of a pipeline phase."""
        if self.level < DebugLevel.SUMMARY:
            return
        _phase_start_time.set(time.time())
        self._log("")
        self._log(f"[PHASE] {phase_name}")
        self._log(self.LINE_SINGLE)
        if context and self.level >= DebugLevel.STANDARD:
            for key, value in context.items():
                self._log(f"  {key}: {value}", DebugLevel.STANDARD)

    def phase_end(self, phase_name: str, result: Optional[str] = None) -> None:
        """Log the end of a pipeline phase."""
        if self.level < DebugLevel.SUMMARY:
            return
        start = _phase_start_time.get()
        elapsed = time.time() - start if start is not None else 0
        self._log(f"[END] {phase_name} completed in {elapsed:.3f}s")
        if result:
            self._log(f"  Result: {result}")

    def log_prompt(self, prompt_type: str, content: str, max_chars: int = 500) -> None:
        """Log a prompt (system or user) with optional truncation."""
        if self.level < DebugLevel.VERBOSE:
            return
        self._log(self.LINE_SINGLE, DebugLevel.VERBOSE)
        self._log(f"[PROMPT] {prompt_type.upper()}:", DebugLevel.VERBOSE)
        truncated = content[:max_chars] + "..." if len(content) > max_chars else content
        for line in truncated.split('\n'):
            self._log(f"  | {line}", DebugLevel.VERBOSE)

    def log_llm_response(self, content: str, max_chars: int = 1000) -> None:
        """Log raw LLM response."""
        if self.level < DebugLevel.VERBOSE:
            return
        self._log(self.LINE_SINGLE, DebugLevel.VERBOSE)
        self._log(f"[LLM-RESPONSE] {len(content)} chars:", DebugLevel.VERBOSE)
        truncated = content[:max_chars] + "..." if len(content) > max_chars else content
        for line in truncated.split('\n')[:30]:  # Limit lines
            self._log(f"  | {line}", DebugLevel.VERBOSE)

    def log_json_parse(self, success: bool, num_items: int = 0, error: str = "") -> None:
        """Log JSON parsing attempt."""
        if self.level < DebugLevel.STANDARD:
            return
        if success:
            self._log(f"  [OK] JSON parsed: {num_items} item(s)", DebugLevel.STANDARD)
        else:
            self._log(f"  [FAIL] JSON parse failed: {error}", DebugLevel.STANDARD)

    def log_suggestion(self, index: int, raw: dict, parsed: bool = True) -> None:
        """Log a single suggestion with details."""
        if self.level < DebugLevel.STANDARD:
            return
        import json as _json
        title = raw.get('title', 'Untitled')
        viz_type = raw.get('viz_type', 'unknown')
        x_axis = raw.get('x_axis', 'N/A')
        y_axes = raw.get('y_axes', [])
        confidence = raw.get('confidence', 0)

        status = "[OK]" if parsed else "[FAIL]"
        self._log(f"  {status} [{index}] \"{title}\" ({viz_type})", DebugLevel.STANDARD)
        self._log(f"       x_axis: {x_axis}", DebugLevel.STANDARD)
        self._log(f"       y_axes: {y_axes}", DebugLevel.STANDARD)
        self._log(f"       confidence: {confidence}", DebugLevel.STANDARD)

        if self.level >= DebugLevel.VERBOSE:
            additional = raw.get('additional_config', {})
            if additional:
                self._log(f"       additional_config: {_json.dumps(additional, default=str)[:200]}", DebugLevel.VERBOSE)
            formula = additional.get('formula', '')
            if formula:
                formula_str = formula.get('input', formula) if isinstance(formula, dict) else str(formula)
                self._log(f"       formula: {formula_str[:100]}", DebugLevel.VERBOSE)

    def log_validation_error(self, suggestion_title: str, field: str, error: str, suggestion_fix: str = "") -> None:
        """Log a validation error."""
        if self.level < DebugLevel.STANDARD:
            return
        self._log(f"  [FAIL] VALIDATION ERROR: {suggestion_title}", DebugLevel.STANDARD)
        self._log(f"       Field: {field}", DebugLevel.STANDARD)
        self._log(f"       Error: {error}", DebugLevel.STANDARD)
        if suggestion_fix:
            self._log(f"       Suggestion: {suggestion_fix}", DebugLevel.STANDARD)

    def log_validation_result(self, title: str, is_valid: bool, errors: Optional[list] = None) -> None:
        """Log overall validation result for a suggestion."""
        if self.level < DebugLevel.STANDARD:
            return
        if is_valid:
            self._log(f"  [OK] VALID: {title}", DebugLevel.STANDARD)
        else:
            self._log(f"  [FAIL] INVALID: {title} ({len(errors or [])} errors)", DebugLevel.STANDARD)
            for err in (errors or []):
                self._log(f"       - {err}", DebugLevel.STANDARD)

    def log_schema_validation(self, index: int, raw: dict, success: bool, error: str = "") -> None:
        """Log Pydantic schema validation attempt."""
        if self.level < DebugLevel.STANDARD:
            return
        title = raw.get('title', f'Suggestion {index}')
        if success:
            self._log(f"  [OK] Schema valid: {title}", DebugLevel.STANDARD)
        else:
            self._log(f"  [FAIL] Schema invalid: {title}", DebugLevel.STANDARD)
            self._log(f"       Error: {error[:200]}", DebugLevel.STANDARD)

    def log_column_check(self, column: str, exists: bool, suggested: str = "") -> None:
        """Log a column existence check."""
        if self.level < DebugLevel.VERBOSE:
            return
        if exists:
            self._log(f"       [OK] Column exists: {column}", DebugLevel.VERBOSE)
        else:
            msg = f"       [FAIL] Column missing: {column}"
            if suggested:
                msg += f" (did you mean '{suggested}'?)"
            self._log(msg, DebugLevel.VERBOSE)

    def log_formula_validation(self, formula: str, is_valid: bool, fixed: str = "", errors: Optional[list] = None) -> None:
        """Log formula validation result."""
        if self.level < DebugLevel.STANDARD:
            return
        self._log(f"  Formula: {formula[:80]}...", DebugLevel.STANDARD)
        if is_valid:
            self._log("  [OK] Formula valid", DebugLevel.STANDARD)
            if fixed != formula:
                self._log(f"       Auto-fixed to: {fixed[:80]}...", DebugLevel.STANDARD)
        else:
            self._log("  [FAIL] Formula invalid", DebugLevel.STANDARD)
            for err in (errors or []):
                self._log(f"       - {err}", DebugLevel.STANDARD)

    def log_correction_attempt(self, original_title: str, errors: list) -> None:
        """Log a correction attempt."""
        if self.level < DebugLevel.STANDARD:
            return
        self._log(f"  [CORRECT] {original_title}", DebugLevel.STANDARD)
        self._log(f"       Errors to fix: {len(errors)}", DebugLevel.STANDARD)
        for err in errors[:3]:
            self._log(f"       - {err}", DebugLevel.STANDARD)

    def log_correction_result(self, success: bool, new_title: str = "", error: str = "") -> None:
        """Log correction result."""
        if self.level < DebugLevel.STANDARD:
            return
        if success:
            self._log(f"  [OK] Correction successful: {new_title}", DebugLevel.STANDARD)
        else:
            self._log(f"  [FAIL] Correction failed: {error}", DebugLevel.STANDARD)

    def log_state_transition(self, from_stage: str, to_stage: str, reason: str = "") -> None:
        """Log a state transition."""
        if self.level < DebugLevel.SUMMARY:
            return
        self._log(f"  [TRANSITION] {from_stage} -> {to_stage}", DebugLevel.SUMMARY)
        if reason and self.level >= DebugLevel.STANDARD:
            self._log(f"       Reason: {reason}", DebugLevel.STANDARD)

    def log_state_snapshot(self, state: dict) -> None:
        """Log a complete state snapshot (TRACE level only)."""
        if self.level < DebugLevel.TRACE:
            return
        self._log(self.LINE_SINGLE, DebugLevel.TRACE)
        self._log("[STATE-SNAPSHOT]", DebugLevel.TRACE)
        for key, value in state.items():
            if key in ('api_key',):
                self._log(f"  {key}: [REDACTED]", DebugLevel.TRACE)
            elif isinstance(value, (list, set)):
                self._log(f"  {key}: [{len(value)} items]", DebugLevel.TRACE)
            elif isinstance(value, dict):
                self._log(f"  {key}: {{{len(value)} keys}}", DebugLevel.TRACE)
            else:
                val_str = str(value)[:100]
                self._log(f"  {key}: {val_str}", DebugLevel.TRACE)

    def log_retry(self, attempt: int, max_attempts: int, reason: str = "") -> None:
        """Log a retry attempt."""
        if self.level < DebugLevel.SUMMARY:
            return
        self._log(f"  [RETRY] {attempt}/{max_attempts}", DebugLevel.SUMMARY)
        if reason:
            self._log(f"       Reason: {reason}", DebugLevel.SUMMARY)


# Module-level singleton. The class instance carries no per-request state
# (timers live in ContextVars), so sharing it across requests is safe.
debug = AIDebugLogger()


# Startup banner — emitted once at module import when debug is enabled.
_startup_level = get_debug_level()
if _startup_level > 0:
    _level_names = {1: "SUMMARY", 2: "STANDARD", 3: "VERBOSE", 4: "TRACE"}
    logger.info(
        "[AI-DEBUG] Debug level: %d (%s)",
        _startup_level, _level_names.get(_startup_level, "CUSTOM"),
    )
