"""Shared debug-logging helpers for the AI suggestion subsystem.

Single source of truth for the ``AI_DEBUG_LEVEL`` environment variable
and the ``[AI-DEBUG]`` log prefix. Imported by ai_service, validators,
formula_validator, and graph (which builds the ``AIDebugLogger`` class
on top of these primitives).

Levels:
    0 = OFF (production default)
    1 = SUMMARY (phase transitions and results)
    2 = STANDARD (+ suggestion details and validation)
    3 = VERBOSE (+ full prompts and LLM responses)
    4 = TRACE (+ state snapshots and function calls)
"""

import logging
import os

_logger = logging.getLogger(__name__)


def get_debug_level() -> int:
    """Read ``AI_DEBUG_LEVEL`` from the environment. Falls back to 0."""
    try:
        return int(os.environ.get("AI_DEBUG_LEVEL", "0"))
    except ValueError:
        return 0


def debug_log(msg: str, min_level: int = 2) -> None:
    """Emit ``msg`` at INFO level when the env level meets ``min_level``.

    Prefixes the message with ``[AI-DEBUG]`` so log aggregators can route
    these lines separately from operational logs. The check is dynamic
    (re-read each call) so the level can be changed at runtime.
    """
    if get_debug_level() >= min_level:
        _logger.info("[AI-DEBUG] %s", msg)
