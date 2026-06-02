"""
LangGraph workflow for generating and validating visualization suggestions.

The workflow follows this pipeline:
1. Generate suggestions from LLM
2. Validate schema (Pydantic)
3. Validate columns exist
4. Validate viz-type requirements  
5. Validate formulas (if applicable)
6. Return validated suggestions or retry with corrections

Debug Levels (set AI_DEBUG_LEVEL environment variable):
0 = OFF (production default)
1 = SUMMARY (phase transitions and results)
2 = STANDARD (+ suggestion details and validation)
3 = VERBOSE (+ full prompts and LLM responses)
4 = TRACE (+ state snapshots and function calls)
"""

import json
import logging
import time
from typing import Any, Optional

from langgraph.graph import StateGraph, START, END

from ._debug import get_debug_level
from .graph_debug import (
    AIDebugLogger,
    DebugLevel,
    _phase_start_time,
    _workflow_start_time,
    debug,
)
from .graph_streaming import (
    _TRANSIENT_BACKOFF_CAP_S,
    _ainvoke_streaming,
    _build_messages,
    _call_model,
    _log_cache_usage,
)
from .graph_parsing import (
    _content_to_text,
    _looks_truncated,
    _parse_json_response,
    _parse_suggestion,
)
from .schemas import (
    VisualizationSuggestion,
    SuggestionGraphState,
    ColumnMetadata,
    ALL_VIZ_TYPES,
)
from .providers import get_chat_model, ProviderType, ainvoke_timeout_s
from .prompts import get_system_prompt, get_user_prompt, get_correction_prompt
from .tools import build_dataset_tools, _safe_json
from .validators import validate_suggestion_complete
from .formula_validator import validate_formula
from .errors import AIProviderError, AIInvalidOutput, classify_and_wrap
from ..ai_metrics import (
    AIMetricsRecord,
    ai_request_id,
    get_collector,
    new_request_id,
)


logger = logging.getLogger(__name__)


# Public surface of the workflow module. The leading-underscore entries are
# helpers that were extracted into ``graph_streaming`` / ``graph_parsing`` /
# ``graph_debug`` during the modular split but stay importable from ``graph``
# for backward compatibility — several tests import or patch them here rather
# than from the split modules. Declaring them keeps that re-export intent
# explicit and stops linters from flagging the imports as unused.
__all__ = [
    # Workflow API
    "create_suggestion_graph",
    "run_suggestion_workflow",
    "initialize_state",
    "MAX_RETRIES",
    "MAX_TOOL_ITERATIONS",
    # Graph nodes
    "generate_suggestions_node",
    "agent_loop_node",
    "validate_schema_node",
    "validate_columns_node",
    "validate_formulas_node",
    "correct_suggestions_node",
    "retry_node",
    # Routers
    "route_after_schema",
    "route_after_columns",
    "route_after_correct",
    "route_after_retry",
    "route_from_start",
    # Re-exported provider/tool factories (patched on this module by tests)
    "get_chat_model",
    "ainvoke_timeout_s",
    "build_dataset_tools",
    # Re-exported streaming/parsing/debug helpers
    "_call_model",
    "_ainvoke_streaming",
    "_build_messages",
    "_log_cache_usage",
    "_TRANSIENT_BACKOFF_CAP_S",
    "_content_to_text",
    "_parse_json_response",
    "_parse_suggestion",
    "_looks_truncated",
    "debug",
    "AIDebugLogger",
    "DebugLevel",
    "get_debug_level",
    "_workflow_start_time",
    "_phase_start_time",
]


# ============= Constants =============

MAX_RETRIES = 3

# Cap on agent↔tool round trips when dataset_access is enabled. After this
# many iterations, the loop forces the LLM to produce the final JSON without
# additional tool calls. Bounds worst-case latency and token spend while
# leaving enough headroom for thorough multi-pass inspection of a dataset.
MAX_TOOL_ITERATIONS = 10


# ============= State Initialization =============

def initialize_state(
    columns: list[dict],
    guidance_text: str,
    api_key: str,
    provider: str,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    available_viz_types: Optional[list[str]] = None,
    existing_visualizations: Optional[list[str]] = None,
    max_suggestions: int = 5,
    dataset_access: bool = False,
    dataframe: Optional[Any] = None,
    max_tool_iterations: Optional[int] = None,
    idle_timeout_s: Optional[float] = None,
) -> SuggestionGraphState:
    """
    Initialize the graph state with input data.

    Args:
        columns: List of column metadata dictionaries
        guidance_text: User's analysis goals
        api_key: AI provider API key
        provider: AI provider name
        model: Model name to use
        effort: Reasoning effort level or None
        available_viz_types: Optional list of supported viz types
        existing_visualizations: Optional list of existing chart titles
        max_suggestions: Maximum suggestions to generate
        dataset_access: When True, route through the agent_loop_node so the
            LLM can call read-only DataFrame inspection tools before emitting
            suggestions. Default False preserves the existing metadata-only
            behavior bit-for-bit.
        dataframe: The pandas DataFrame the bound tools close over. Required
            when dataset_access is True; ignored otherwise.
    """
    # Extract column sets by type
    valid_columns = {col['name'] for col in columns}
    numeric_cols = {col['name'] for col in columns if col.get('data_type') == 'numeric'}
    datetime_cols = {col['name'] for col in columns if col.get('data_type') == 'datetime'}
    categorical_cols = {col['name'] for col in columns if col.get('data_type') == 'categorical'}

    return SuggestionGraphState(
        columns=columns,
        guidance_text=guidance_text,
        available_viz_types=available_viz_types or list(ALL_VIZ_TYPES),
        existing_visualizations=existing_visualizations or [],
        max_suggestions=max_suggestions,
        api_key=api_key,
        provider=provider,
        model=model or "",
        effort=effort or "",
        valid_column_names=valid_columns,
        numeric_columns=numeric_cols,
        datetime_columns=datetime_cols,
        categorical_columns=categorical_cols,
        suggestions=[],
        validated_suggestions=[],
        validation_errors=[],
        failed_suggestions=[],
        retry_count=0,
        max_retries=MAX_RETRIES,
        current_stage="agent_loop" if dataset_access else "generate",
        usage_records=[],
        dataset_access=dataset_access,
        dataframe=dataframe,
        tool_iterations=0,
        tool_calls_made=0,
        max_tool_iterations=(
            max_tool_iterations
            if max_tool_iterations and max_tool_iterations > 0
            else MAX_TOOL_ITERATIONS
        ),
        # 0/negative/None all collapse to "unset"; the node-level fallback
        # then asks ``ainvoke_timeout_s`` to pick the right default based on
        # effort and tool binding. A user-supplied override otherwise wins.
        idle_timeout_s=(
            float(idle_timeout_s)
            if idle_timeout_s and idle_timeout_s > 0
            else 0.0
        ),
    )


# ============= Node Functions =============

async def generate_suggestions_node(state: SuggestionGraphState) -> dict:
    """
    Generate visualization suggestions from the LLM.
    
    Uses the chat model to generate suggestions based on
    the dataset metadata and user guidance.
    """
    debug.phase_start("generate_suggestions_node", {
        "provider": state['provider'],
        "model": state.get('model') or 'default',
        "num_columns": len(state['columns']),
        "max_suggestions": state['max_suggestions']
    })
    debug.log_state_snapshot(state)
    
    logger.info(f"Generating suggestions with {state['provider']}")
    
    try:
        # Create chat model
        chat_model = get_chat_model(
            provider=state['provider'],
            api_key=state['api_key'],
            model=state.get('model') or None,
            effort=state.get('effort') or None,
        )
        
        # Build prompts
        system_prompt = get_system_prompt()
        user_prompt = get_user_prompt(
            columns=state['columns'],
            guidance_text=state['guidance_text'],
            available_viz_types=state['available_viz_types'],
            existing_visualizations=state['existing_visualizations'],
            max_suggestions=state['max_suggestions']
        )
        
        # Log prompts at VERBOSE level
        debug.log_prompt("SYSTEM", system_prompt)
        debug.log_prompt("USER", user_prompt, max_chars=1000)
        
        # Generate response. For Claude, the system prompt is wrapped in a
        # content block with cache_control so Anthropic caches it (~5 min TTL).
        messages = _build_messages(system_prompt, user_prompt, state['provider'])

        idle_timeout_s = (
            state.get('idle_timeout_s')
            or ainvoke_timeout_s(state['provider'], state.get('effort'))
        )
        response = await _call_model(
            chat_model,
            messages,
            provider=state['provider'],
            api_key=state.get('api_key'),
            idle_timeout_s=idle_timeout_s,
        )
        content = _content_to_text(response.content)
        usage = _log_cache_usage(response, state['provider'])

        # Log raw LLM response
        debug.log_llm_response(content)

        # Parse JSON from response
        suggestions = _parse_json_response(content)

        # Log parsing result
        if suggestions:
            debug.log_json_parse(success=True, num_items=len(suggestions))
        else:
            debug.log_json_parse(success=False, error="No suggestions parsed from response")

        # Log raw suggestions for visibility
        logger.info(f"AI generated {len(suggestions)} raw suggestions")
        for i, s in enumerate(suggestions):
            debug.log_suggestion(i + 1, s, parsed=True)
            title = s.get('title', 'Untitled')
            viz_type = s.get('viz_type', 'unknown')
            formula = s.get('additional_config', {}).get('formula', '')
            formula_preview = (formula[:50] + '...') if isinstance(formula, str) and len(formula) > 50 else formula
            logger.info(f"  [{i+1}] {title} ({viz_type}){' formula=' + str(formula_preview) if formula else ''}")

        debug.phase_end("generate_suggestions_node", f"{len(suggestions)} suggestions generated")
        debug.log_state_transition("generate", "validate_schema", f"{len(suggestions)} raw suggestions to validate")

        return {
            "suggestions": suggestions,
            "current_stage": "validate_schema",
            "usage_records": list(state.get('usage_records', [])) + [usage],
        }
        
    except AIProviderError:
        # Typed provider/network failures must reach the API layer verbatim
        # so the client can surface a specific error_class. They must NOT be
        # caught into a string or re-enter the schema-correction retry loop.
        debug.phase_end("generate_suggestions_node", "FAILED: provider error")
        raise
    except Exception as e:
        # Classify provider SDK exceptions (anthropic.RateLimitError,
        # google.genai 429s wrapped in ChatGoogleGenerativeAIError, etc.) and
        # re-raise as typed errors. Without this, a quota/rate-limit error
        # falls through to the string-error path below and the workflow
        # immediately retries the same call up to ``MAX_RETRIES`` times — a
        # guaranteed retry storm against the same exhausted quota.
        typed = classify_and_wrap(
            e, provider=state.get('provider'), api_key=state.get('api_key')
        )
        # Typed: bubble up so the API layer maps to a real status code.
        logger.error(f"Provider error generating suggestions: {typed}")
        debug.phase_end("generate_suggestions_node", f"FAILED (typed): {typed}")
        raise typed from e


async def agent_loop_node(state: SuggestionGraphState) -> dict:
    """Generate suggestions via an LLM ↔ tool round-trip loop.

    Runs only when ``state['dataset_access']`` is True (privacy OFF). Builds the
    read-only inspection tools from ``state['dataframe']``, binds them to the
    chat model, and iterates ``agent_step → tool_step`` until either:
        - the assistant returns a message with no ``tool_calls`` (final JSON), or
        - ``MAX_TOOL_ITERATIONS`` rounds elapse and we force a final answer.

    The final assistant content is parsed with ``_parse_json_response`` and
    handed to ``validate_schema`` exactly like ``generate_suggestions_node``.
    Per-call usage is appended to ``state['usage_records']`` so the metrics
    record at the end of the workflow captures multi-step token spend.
    """
    # Local import keeps the message-class dependency out of the metadata-only
    # path (privacy ON) and avoids paying the import cost at module load.
    from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

    debug.phase_start("agent_loop_node", {
        "provider": state['provider'],
        "model": state.get('model') or 'default',
        "num_columns": len(state['columns']),
        "max_iterations": state.get('max_tool_iterations') or MAX_TOOL_ITERATIONS,
    })
    debug.log_state_snapshot(state)

    df = state.get('dataframe')
    if df is None:
        msg = "agent_loop_node: dataframe is missing from state"
        logger.error(msg)
        debug.phase_end("agent_loop_node", "FAILED: no dataframe")
        return {
            "validation_errors": [msg],
            "current_stage": "done",
        }

    logger.info(f"Generating suggestions via tool-use loop with {state['provider']}")

    new_usage: list[dict] = []
    tool_calls_made = 0
    iterations = 0

    try:
        # Build tools and chat model. We keep an unbound copy of the model so
        # the final forced-answer call (when the iteration cap is hit) cannot
        # request additional tool calls.
        tools = build_dataset_tools(df)
        tool_map = {t.name: t for t in tools}

        chat_model_unbound = get_chat_model(
            provider=state['provider'],
            api_key=state['api_key'],
            model=state.get('model') or None,
            effort=state.get('effort') or None,
            tools_bound=True,
        )
        # First iteration: force a tool call. Without this, providers (Claude
        # in particular) often skip inspection entirely and produce suggestions
        # straight from metadata — which defeats the purpose of dataset access
        # and is the exact symptom we observed in production logs.
        # After the first iteration the bound model switches to ``auto`` so the
        # model can stop calling tools when it has enough information.
        #
        # Exception: Anthropic rejects the combination of extended thinking and
        # ``tool_choice="any"`` ("Thinking may not be enabled when tool_choice
        # forces tool use"). When effort is on for Claude we drop the forcing
        # and rely solely on the prompt's "MUST inspect the data" rule. Other
        # providers (OpenAI, Gemini) accept the forced choice with thinking on.
        _force_tool_choice = not (state['provider'] == 'claude' and state.get('effort'))
        chat_model = chat_model_unbound.bind_tools(tools)
        if _force_tool_choice:
            chat_model_forced = chat_model_unbound.bind_tools(tools, tool_choice="any")
        else:
            logger.info(
                "Agent loop: skipping tool_choice='any' for Claude+effort "
                "(extended thinking is incompatible with forced tool choice)"
            )
            chat_model_forced = chat_model

        # Build the seed messages. Using the dataset_access variant of the
        # system prompt so the model knows the tools exist and the protocol
        # for using them.
        system_prompt = get_system_prompt(dataset_access=True)
        user_prompt = get_user_prompt(
            columns=state['columns'],
            guidance_text=state['guidance_text'],
            available_viz_types=state['available_viz_types'],
            existing_visualizations=state['existing_visualizations'],
            max_suggestions=state['max_suggestions'],
        )

        debug.log_prompt("SYSTEM", system_prompt)
        debug.log_prompt("USER", user_prompt, max_chars=1000)

        messages: list = list(_build_messages(system_prompt, user_prompt, state['provider']))

        # The agent-loop binds tools, so every request carries the tool
        # schemas + dataset metadata on top of the system prompt. Use the
        # longer idle-timeout budget unconditionally — the default cap is
        # too tight for the tool-bound path even when no explicit reasoning
        # effort is set. ``_ainvoke_streaming`` resets this on every chunk,
        # so a long-but-still-progressing response is not killed. A
        # per-request override from the UI ("Advanced → Idle Timeout") takes
        # precedence when supplied.
        idle_timeout_s = (
            state.get('idle_timeout_s')
            or ainvoke_timeout_s(
                state['provider'], state.get('effort'), tools_bound=True
            )
        )
        final_content = ""

        # The cap is per-request — the user can override it from the AI
        # settings. Fall back to the module default for older requests
        # that didn't supply one.
        max_iterations = state.get('max_tool_iterations') or MAX_TOOL_ITERATIONS

        while iterations < max_iterations:
            iterations += 1
            # Iteration 1 uses tool_choice="any" to guarantee inspection;
            # subsequent iterations use auto so the model can decide when to
            # stop and emit the final JSON.
            active_model = chat_model_forced if iterations == 1 else chat_model
            response = await _call_model(
                active_model,
                messages,
                provider=state['provider'],
                api_key=state.get('api_key'),
                idle_timeout_s=idle_timeout_s,
            )

            new_usage.append(_log_cache_usage(response, state['provider']))

            # Append the assistant message verbatim so the tool_call_id metadata
            # (needed to attach ToolMessage results) survives.
            messages.append(response)

            tool_calls = getattr(response, 'tool_calls', None) or []

            if not tool_calls:
                final_content = _content_to_text(response.content)
                debug.log_llm_response(final_content)
                break

            logger.info(
                f"Agent loop iter {iterations}: model requested {len(tool_calls)} tool call(s)"
            )

            for tc in tool_calls:
                # LangChain normalizes tool_calls to dicts: {name, args, id, type}.
                # Some providers may still return objects; handle both.
                if isinstance(tc, dict):
                    name = tc.get('name')
                    args = tc.get('args') or {}
                    tc_id = tc.get('id')
                else:
                    name = getattr(tc, 'name', None)
                    args = getattr(tc, 'args', {}) or {}
                    tc_id = getattr(tc, 'id', None)
                tool_calls_made += 1

                tool_obj = tool_map.get(name)
                if tool_obj is None:
                    result_content = f"ERROR: unknown tool '{name}'"
                else:
                    try:
                        result_content = await tool_obj.ainvoke(args)
                    except Exception as exc:
                        # Tools already swallow their own errors and return
                        # ERROR strings; this catches anything that escapes.
                        result_content = f"ERROR: tool '{name}' raised: {exc}"

                if not isinstance(result_content, str):
                    try:
                        result_content = _safe_json(result_content)
                    except Exception as serialize_exc:
                        # `_safe_json` rejects NaN/Inf via ``allow_nan=False``,
                        # so a Tool returning a raw NaN-bearing payload would
                        # land here. Log and degrade to ``str(...)`` instead
                        # of dropping the tool result entirely.
                        logger.warning(
                            "Tool %r returned non-JSON-serializable value: %s",
                            name, serialize_exc,
                        )
                        result_content = str(result_content)

                messages.append(
                    ToolMessage(content=result_content, tool_call_id=tc_id, name=name or "")
                )
                logger.info(f"  → tool {name}({args}) returned {len(result_content)} chars")
        else:
            # `while...else` runs only when the loop exits without `break`,
            # i.e. the iteration cap was hit while the model was still calling
            # tools. Force a final JSON answer with the unbound model so it
            # cannot request more tools.
            logger.warning(
                f"Agent loop hit max_tool_iterations={max_iterations}; forcing final JSON"
            )
            # Inline a complete object so the model has a concrete shape to
            # anchor on without tracing back to the system prompt's schema —
            # this is the most reliable way to keep the cap-reached output
            # well-formed, especially after a long tool-use conversation.
            messages.append(
                HumanMessage(
                    content=(
                        "Tool call cap reached. Stop calling tools and emit ONLY a "
                        "JSON ARRAY of visualization-suggestion OBJECTS. Do not "
                        "emit a list of strings — each element must be a complete "
                        "object with all required fields.\n\n"
                        "Each object MUST have these keys (omit unknown ones, do "
                        "not invent new ones):\n"
                        "  title (string), description (string), viz_type (string),\n"
                        "  x_axis (string), y_axes (array of strings), x_label "
                        "(string), y_label (string), legend_labels (array of "
                        "strings), plot_type (string), confidence (number), "
                        "reasoning (string), additional_config (object).\n\n"
                        "Example of a single valid element (replace every value "
                        "with content grounded in the dataset you inspected):\n"
                        "{\n"
                        '  "title": "Variable Trend Over Time",\n'
                        '  "description": "Plots a numeric variable against time to highlight trends and anomalies",\n'
                        '  "viz_type": "universal",\n'
                        '  "x_axis": "<datetime column from the schema>",\n'
                        '  "y_axes": ["<numeric column from the schema>"],\n'
                        '  "x_label": "Time",\n'
                        '  "y_label": "Value",\n'
                        '  "legend_labels": ["<descriptive label>"],\n'
                        '  "plot_type": "line",\n'
                        '  "confidence": 0.85,\n'
                        '  "reasoning": "<one or two sentences on what the chart reveals>",\n'
                        '  "additional_config": {}\n'
                        "}\n\n"
                        "Now emit the JSON array of all your suggestions in the "
                        "same shape. No tool calls. No prose around the JSON. "
                        "Use only column names that appeared in the tool results "
                        "above."
                    )
                )
            )
            response = await _call_model(
                chat_model_unbound,
                messages,
                provider=state['provider'],
                api_key=state.get('api_key'),
                idle_timeout_s=idle_timeout_s,
            )
            new_usage.append(_log_cache_usage(response, state['provider']))
            final_content = _content_to_text(response.content)
            debug.log_llm_response(final_content)

        suggestions = _parse_json_response(final_content)

        # Recovery turn: model emitted SOMETHING but the parser could not
        # extract a suggestion list. This happens when streaming truncates
        # mid-content (unclosed fence/brackets), when the model wraps its
        # output in prose around malformed JSON, or when subtle syntax
        # errors slip past the lenient cleanup (e.g. unescaped newlines
        # inside string values).
        #
        # Re-running the full agent loop is almost always wasted budget —
        # the model is in a state where it *believes* it answered. Instead
        # we do ONE targeted repair turn with the unbound model: hand it
        # back exactly what it emitted plus an instruction to re-emit clean
        # JSON. This mirrors the bare-string reconstruction path in
        # ``correct_suggestions_node`` and recovers ~all transient parse
        # failures without restarting the tool-use conversation.
        if not suggestions and final_content and final_content.strip():
            logger.warning(
                "Agent loop iter %d: parser returned 0 suggestions from "
                "non-empty content (len=%d); attempting one repair turn",
                iterations, len(final_content),
            )
            try:
                repair_messages = [
                    SystemMessage(
                        content=(
                            "You repair malformed JSON output from another LLM. "
                            "You return ONLY a JSON array of visualization-suggestion "
                            "objects. No markdown, no prose, no code fences."
                        )
                    ),
                    HumanMessage(
                        content=(
                            "The text below was supposed to be a JSON array of "
                            "visualization-suggestion objects but failed to parse. "
                            "Re-emit it as a clean JSON array. Preserve every field "
                            "and value verbatim. Do NOT invent new suggestions. Do "
                            "NOT add commentary. Do NOT wrap in markdown fences.\n\n"
                            "Each element must be a complete object with keys: "
                            "title, description, viz_type, x_axis, y_axes, x_label, "
                            "y_label, legend_labels, plot_type, confidence, "
                            "reasoning, additional_config.\n\n"
                            "If the input contains only partial/truncated JSON, "
                            "emit only the suggestion objects that are complete and "
                            "drop anything cut off mid-object.\n\n"
                            "---BEGIN MALFORMED CONTENT---\n"
                            f"{final_content}\n"
                            "---END MALFORMED CONTENT---"
                        )
                    ),
                ]
                repair_response = await _call_model(
                    chat_model_unbound,
                    repair_messages,
                    provider=state['provider'],
                    api_key=state.get('api_key'),
                    idle_timeout_s=idle_timeout_s,
                )
                new_usage.append(_log_cache_usage(repair_response, state['provider']))
                repair_content = _content_to_text(repair_response.content)
                suggestions = _parse_json_response(repair_content)
                if suggestions:
                    logger.info(
                        "Agent loop repair turn recovered %d suggestion(s)",
                        len(suggestions),
                    )
                    final_content = repair_content
                else:
                    logger.warning(
                        "Agent loop repair turn also returned 0 suggestions"
                    )
            except AIProviderError as repair_exc:
                # Repair turn failed (timeout, rate limit, etc.). Don't mask
                # the original parse failure with the provider error —
                # continue to the original raise below so the user sees the
                # actual model output that failed.
                logger.warning(
                    "Agent loop repair turn failed: %s: %s",
                    type(repair_exc).__name__, repair_exc,
                )

        if suggestions:
            debug.log_json_parse(success=True, num_items=len(suggestions))
        else:
            debug.log_json_parse(success=False, error="No suggestions parsed from response")

        logger.info(
            f"Agent loop produced {len(suggestions)} raw suggestions after "
            f"{iterations} iteration(s), {tool_calls_made} tool call(s)"
        )
        for i, s in enumerate(suggestions):
            debug.log_suggestion(i + 1, s, parsed=True)

        # If even the repair turn couldn't extract suggestions, surface as a
        # typed error so the API layer maps to 422 and the frontend stops
        # the runaway loop. Include a 4000-char preview (was 400) — 400 was
        # not enough to diagnose the trace where the failure motivated this
        # recovery path: the cause was in the *middle* of the content, not
        # the start.
        if not suggestions:
            preview = (final_content or "").strip()
            truncated_emission = _looks_truncated(preview)
            if len(preview) > 4000:
                preview = preview[:3997] + "…"
            logger.error(
                "Agent loop produced no parseable suggestions. "
                f"tool_calls={tool_calls_made}, iterations={iterations}, "
                f"content_len={len(final_content or '')}, "
                f"looks_truncated={truncated_emission}. "
                f"Last assistant content: {preview!r}"
            )
            debug.phase_end("agent_loop_node", "FAILED: no suggestions parsed")
            short_preview = preview[:400] + ("…" if len(preview) > 400 else "")
            # When the emission looks truncated mid-string, the most likely
            # cause is the model's output-token budget exhausting on the
            # thinking phase (observed with Gemini 3.x). Surface a clearer
            # hint so the user can lower ``max_suggestions`` or pick a
            # smaller model, rather than re-trying the same request blindly.
            if truncated_emission:
                detail = (
                    f"The {state.get('provider') or 'model'} response was cut off "
                    f"mid-output (got {len(final_content or '')} chars of partial JSON). "
                    "This usually means the model exhausted its output-token budget on "
                    "internal reasoning before finishing the suggestion list. Try "
                    "lowering max_suggestions, disabling reasoning effort, or using a "
                    "non-thinking model variant.\n\n"
                    f"Response preview: {short_preview!r}"
                )
            else:
                detail = (
                    f"The model produced no valid suggestions after {iterations} "
                    f"iteration(s) and {tool_calls_made} tool call(s). "
                    f"Response preview: {short_preview!r}"
                )
            raise AIInvalidOutput(detail, provider=state.get('provider'))

        debug.phase_end(
            "agent_loop_node",
            f"{len(suggestions)} suggestions, {tool_calls_made} tool calls in {iterations} iter"
        )
        debug.log_state_transition(
            "agent_loop", "validate_schema",
            f"{len(suggestions)} raw suggestions to validate"
        )

        return {
            "suggestions": suggestions,
            "current_stage": "validate_schema",
            "usage_records": list(state.get('usage_records', [])) + new_usage,
            "tool_iterations": iterations,
            "tool_calls_made": state.get('tool_calls_made', 0) + tool_calls_made,
        }

    except AIProviderError:
        debug.phase_end("agent_loop_node", "FAILED: provider error")
        raise
    except Exception as e:
        # See generate_suggestions_node: classify provider SDK exceptions and
        # re-raise as typed errors so a 429/quota doesn't trigger the
        # validate_schema → retry → agent_loop loop with no backoff.
        typed = classify_and_wrap(
            e, provider=state.get('provider'), api_key=state.get('api_key')
        )
        logger.error(f"Provider error in agent loop: {typed}")
        debug.phase_end("agent_loop_node", f"FAILED (typed): {typed}")
        raise typed from e


def validate_schema_node(state: SuggestionGraphState) -> dict:
    """
    Validate suggestions against Pydantic schema.
    
    Attempts to parse each suggestion into a VisualizationSuggestion.
    Tracks failed suggestions for potential correction.
    """
    debug.phase_start("validate_schema_node", {
        "num_suggestions": len(state['suggestions'])
    })
    
    validated = []
    failed = []
    errors = []
    
    for i, raw in enumerate(state['suggestions']):
        try:
            # Try to create Pydantic model
            suggestion = _parse_suggestion(raw)
            validated.append(suggestion)
            debug.log_schema_validation(i + 1, raw, success=True)
        except Exception as e:
            error_str = str(e)
            errors.append(f"Suggestion {i+1} schema error: {error_str}")
            debug.log_schema_validation(i + 1, raw, success=False, error=error_str)
            # Track failed suggestion for correction
            failed.append({
                "raw": raw,
                "errors": [error_str]
            })
    
    # Determine next stage based on results
    if validated:
        next_stage = "validate_columns"
        reason = f"{len(validated)} valid, {len(failed)} failed"
    elif failed and state['retry_count'] < state['max_retries']:
        next_stage = "correct"  # Try to correct failed suggestions
        reason = f"All {len(failed)} suggestions failed schema validation, attempting correction"
    else:
        next_stage = "retry"  # Fall back to full regeneration
        reason = "No valid suggestions and max corrections reached"
    
    debug.phase_end("validate_schema_node", f"{len(validated)} passed, {len(failed)} failed")
    debug.log_state_transition("validate_schema", next_stage, reason)
    
    return {
        "validated_suggestions": validated,
        "failed_suggestions": failed,
        "validation_errors": state.get('validation_errors', []) + errors,
        "current_stage": next_stage
    }


def validate_columns_node(state: SuggestionGraphState) -> dict:
    """
    Validate that all column references exist.
    Tracks failed suggestions for potential correction.
    """
    debug.phase_start("validate_columns_node", {
        "num_suggestions": len(state['validated_suggestions']),
        "valid_columns": len(state['valid_column_names']),
        "numeric_columns": len(state.get('numeric_columns', set())),
        "datetime_columns": len(state.get('datetime_columns', set()))
    })
    
    valid_suggestions = []
    failed = []
    errors = []
    column_metadata = {col['name']: ColumnMetadata(**col) for col in state['columns']}
    
    for suggestion in state['validated_suggestions']:
        result = validate_suggestion_complete(
            suggestion,
            state['valid_column_names'],
            column_metadata
        )
        
        if result.is_valid:
            valid_suggestions.append(suggestion)
            debug.log_validation_result(suggestion.title, is_valid=True)
        else:
            # Collect errors
            error_msgs = []
            for error in result.errors:
                error_msgs.append(f"{error.field} - {error.error}")
                errors.append(f"{suggestion.title}: {error.field} - {error.error}")
                debug.log_validation_error(
                    suggestion.title, 
                    error.field, 
                    error.error, 
                    error.suggestion
                )
            
            debug.log_validation_result(suggestion.title, is_valid=False, errors=error_msgs)
            
            # Track for correction
            failed.append({
                "raw": suggestion.model_dump(),
                "errors": error_msgs
            })
    
    # Determine next stage
    if failed and state['retry_count'] < state['max_retries']:
        # Attempt to correct failed suggestions even if some passed
        next_stage = "correct"
        reason = f"{len(valid_suggestions)} passed, {len(failed)} failed - attempting correction"
    elif valid_suggestions:
        # All passed or no retries left, proceed with what we have
        has_formulas = any(s.viz_type == "formula" for s in valid_suggestions)
        next_stage = "validate_formulas" if has_formulas else "done"
        reason = f"{len(valid_suggestions)} passed" + (", has formulas to validate" if has_formulas else "")
    else:
        next_stage = "done"
        reason = "No valid suggestions and no retries left"
    
    debug.phase_end("validate_columns_node", f"{len(valid_suggestions)} passed, {len(failed)} failed")
    debug.log_state_transition("validate_columns", next_stage, reason)
    
    return {
        "validated_suggestions": valid_suggestions,
        "failed_suggestions": failed,
        "validation_errors": state.get('validation_errors', []) + errors,
        "current_stage": next_stage
    }


def validate_formulas_node(state: SuggestionGraphState) -> dict:
    """
    Validate formula expressions for formula viz types.
    """
    formula_count = sum(1 for s in state['validated_suggestions'] if s.viz_type == "formula")
    debug.phase_start("validate_formulas_node", {
        "total_suggestions": len(state['validated_suggestions']),
        "formula_suggestions": formula_count
    })
    
    valid_suggestions = []
    errors = []
    
    for suggestion in state['validated_suggestions']:
        if suggestion.viz_type == "formula":
            config = suggestion.additional_config
            formula_input = config.formula.input if config.formula else None
            logger.info(f"Validating formula for '{suggestion.title}': {formula_input[:80] + '...' if formula_input and len(formula_input) > 80 else formula_input}")
            if config.formula and config.formula.input:
                result, fixed = validate_formula(
                    config.formula.input,
                    state['valid_column_names'],
                    auto_fix=True
                )
                
                # Log formula validation result
                error_msgs = [err.error for err in result.errors] if not result.is_valid else []
                debug.log_formula_validation(
                    config.formula.input,
                    result.is_valid,
                    fixed,
                    error_msgs
                )
                
                if not result.is_valid:
                    for error in result.errors:
                        errors.append(f"{suggestion.title} formula: {error.error}")
                    continue
                
                # Update with fixed formula input
                config.formula.input = fixed
        
        valid_suggestions.append(suggestion)
    
    debug.phase_end("validate_formulas_node", f"{len(valid_suggestions)} passed")
    debug.log_state_transition("validate_formulas", "done", f"{len(valid_suggestions)} suggestions validated")
    
    return {
        "validated_suggestions": valid_suggestions,
        "validation_errors": state.get('validation_errors', []) + errors,
        "current_stage": "done"
    }


async def correct_suggestions_node(state: SuggestionGraphState) -> dict:
    """
    Attempt to correct failed suggestions using error feedback.
    
    Uses get_correction_prompt to provide specific error context to the LLM,
    allowing it to fix individual suggestions rather than regenerating all.
    """
    debug.phase_start("correct_suggestions_node", {
        "failed_count": len(state.get('failed_suggestions', [])),
        "retry_count": state['retry_count'],
        "max_retries": state['max_retries']
    })
    
    if not state.get('failed_suggestions'):
        debug.phase_end("correct_suggestions_node", "No failed suggestions to correct")
        return {
            "current_stage": "done"
        }
    
    logger.info(f"Correcting {len(state['failed_suggestions'])} failed suggestions")

    corrected = []
    errors = []
    new_usage: list[dict] = []
    valid_columns = list(state['valid_column_names'])

    # ---- Bare-string reconstruction (one-shot) ----
    # When the model emits an array of titles like ``["A", "B", "C"]`` instead
    # of an array of suggestion objects, the per-suggestion correction prompt
    # can't be built (it expects a dict). Instead, batch all string titles
    # into a single "expand each title into a full object" call. The model
    # already did the analytical work — picked sensible titles based on its
    # tool inspection — it just emitted the wrong shape. Pre-loop so it runs
    # before any object-shaped corrections.
    string_titles: list[str] = [
        f.get('raw') for f in state.get('failed_suggestions', [])
        if isinstance(f.get('raw'), str) and f.get('raw').strip()
    ]
    object_failures: list[dict] = [
        f for f in state.get('failed_suggestions', [])
        if isinstance(f.get('raw'), dict)
    ]

    try:
        # Create chat model (no extra effort for corrections)
        chat_model = get_chat_model(
            provider=state['provider'],
            api_key=state['api_key'],
            model=state.get('model') or None,
        )

        if string_titles:
            logger.info(
                f"Reconstructing {len(string_titles)} bare-string titles into "
                f"full suggestion objects"
            )
            reconstruction_prompt = (
                "Your previous response returned an array of bare title "
                "strings instead of suggestion objects:\n\n"
                f"{json.dumps(string_titles, ensure_ascii=False)}\n\n"
                "Each title is a usable starting point, but the API requires "
                "every element to be a FULL suggestion object with the "
                "required fields, not a bare string.\n\n"
                "Expand each title into a complete visualization-suggestion "
                "object. Use ONLY these columns: "
                f"{', '.join(valid_columns[:50])}"
                f"{'…' if len(valid_columns) > 50 else ''}.\n\n"
                "Each object MUST contain:\n"
                "  title, description, viz_type, x_axis, y_axes, x_label, "
                "y_label, y2_label, legend_labels, plot_type, confidence, "
                "reasoning, additional_config.\n\n"
                "Return ONLY a JSON array of objects (not strings) in the "
                "exact shape documented in the system prompt. No prose, no "
                "markdown fences."
            )
            system_prompt = get_system_prompt()
            messages = _build_messages(
                system_prompt, reconstruction_prompt, state['provider']
            )
            idle_timeout_s = (
                state.get('idle_timeout_s')
                or ainvoke_timeout_s(state['provider'], state.get('effort'))
            )
            response = await _call_model(
                chat_model,
                messages,
                provider=state['provider'],
                api_key=state.get('api_key'),
                idle_timeout_s=idle_timeout_s,
            )
            content = _content_to_text(response.content)
            new_usage.append(_log_cache_usage(response, state['provider']))
            debug.log_llm_response(content)

            reconstructed_raw = _parse_json_response(content)
            for raw in reconstructed_raw:
                if not isinstance(raw, dict):
                    # The model failed to reshape even on the targeted retry;
                    # we don't loop further — surface as a validation error
                    # and let the workflow finish.
                    errors.append(
                        "Reconstruction returned a non-object element "
                        f"({type(raw).__name__})"
                    )
                    continue
                try:
                    suggestion = _parse_suggestion(raw)
                    corrected.append(suggestion)
                    logger.info(
                        f"Reconstructed bare-string title into: {suggestion.title}"
                    )
                except Exception as parse_exc:
                    errors.append(f"Reconstruction parse failed: {parse_exc}")

        # ---- Per-object corrections (existing path) ----
        for failed in object_failures[:3]:  # Limit to 3 corrections per round
            raw_suggestion = failed.get('raw', {})
            error_list = failed.get('errors', [])

            if not raw_suggestion or not error_list:
                continue

            original_title = raw_suggestion.get('title', 'Unknown')
            debug.log_correction_attempt(original_title, error_list)
            
            # Build correction prompt
            correction_prompt = get_correction_prompt(
                original_suggestion=raw_suggestion,
                errors=error_list,
                valid_columns=valid_columns
            )
            
            # Log correction prompt at VERBOSE level
            debug.log_prompt("CORRECTION", correction_prompt, max_chars=800)
            
            # Get system prompt for context
            system_prompt = get_system_prompt()

            messages = _build_messages(system_prompt, correction_prompt, state['provider'])

            idle_timeout_s = (
                state.get('idle_timeout_s')
                or ainvoke_timeout_s(state['provider'], state.get('effort'))
            )
            try:
                response = await _call_model(
                    chat_model,
                    messages,
                    provider=state['provider'],
                    api_key=state.get('api_key'),
                    idle_timeout_s=idle_timeout_s,
                )
                content = _content_to_text(response.content)
                usage = _log_cache_usage(response, state['provider'])
                new_usage.append(usage)

                # Log correction response
                debug.log_llm_response(content)

                # Parse corrected suggestion
                corrected_raw = _parse_json_response(content)
                if corrected_raw:
                    # Take first result if multiple
                    corrected_data = corrected_raw[0] if isinstance(corrected_raw, list) else corrected_raw
                    corrected_suggestion = _parse_suggestion(corrected_data)
                    corrected.append(corrected_suggestion)
                    logger.info(f"Successfully corrected: {corrected_suggestion.title}")
                    debug.log_correction_result(success=True, new_title=corrected_suggestion.title)
                else:
                    debug.log_correction_result(success=False, error="No valid JSON in response")

            except AIProviderError:
                # Typed provider errors (timeout/rate-limit/etc.) abort the
                # whole correction phase — propagate to the node-level handler.
                raise
            except Exception as e:
                errors.append(f"Correction failed: {str(e)}")
                logger.warning(f"Failed to correct suggestion: {e}")
                debug.log_correction_result(success=False, error=str(e))

    except AIProviderError:
        debug.phase_end("correct_suggestions_node", "FAILED: provider error")
        raise
    except Exception as e:
        logger.error(f"Correction node error: {e}")
        errors.append(f"Correction error: {str(e)}")
    
    # Merge corrected with already valid suggestions
    all_valid = state.get('validated_suggestions', []) + corrected
    
    next_stage = "validate_columns" if corrected else "done"
    debug.phase_end("correct_suggestions_node", f"{len(corrected)} corrected, {len(errors)} failed")
    debug.log_state_transition("correct", next_stage, 
                               f"Corrected {len(corrected)}, re-validating" if corrected else "No corrections succeeded")
    
    return {
        "validated_suggestions": all_valid,
        "failed_suggestions": [],  # Clear failed after correction attempt
        "validation_errors": state.get('validation_errors', []) + errors,
        "retry_count": state['retry_count'] + 1,
        "current_stage": next_stage,
        "usage_records": list(state.get('usage_records', [])) + new_usage,
    }


def retry_node(state: SuggestionGraphState) -> dict:
    """
    Decide whether to regenerate or give up.
    
    This is now a fallback for when correction isn't possible (e.g., no failed suggestions).
    """
    debug.phase_start("retry_node", {
        "retry_count": state['retry_count'],
        "max_retries": state['max_retries']
    })
    
    if state['retry_count'] >= state['max_retries']:
        debug.phase_end("retry_node", "Max retries reached, giving up")
        debug.log_state_transition("retry", "done", "Max retries exceeded")
        return {
            "current_stage": "done"
        }
    
    debug.log_retry(state['retry_count'] + 1, state['max_retries'], "Regenerating all suggestions")
    logger.info(f"Retrying generation (attempt {state['retry_count'] + 1}/{state['max_retries']})")
    
    debug.phase_end("retry_node", f"Retry {state['retry_count'] + 1}")
    debug.log_state_transition("retry", "generate", "Fresh regeneration attempt")
    
    return {
        "retry_count": state['retry_count'] + 1,
        "suggestions": [],  # Clear old suggestions
        "validated_suggestions": [],
        "failed_suggestions": [],  # Clear failed for fresh start
        "current_stage": "generate"
    }


# ============= Router Functions =============

def route_after_schema(state: SuggestionGraphState) -> str:
    """Route based on schema validation result."""
    if state['current_stage'] == "validate_columns":
        return "validate_columns"
    elif state['current_stage'] == "correct":
        return "correct"
    elif state['current_stage'] == "retry":
        return "retry"
    return "end"


def route_after_columns(state: SuggestionGraphState) -> str:
    """Route based on column validation result."""
    if state['current_stage'] == "validate_formulas":
        return "validate_formulas"
    elif state['current_stage'] == "correct":
        return "correct"
    elif state['current_stage'] == "retry":
        return "retry"
    return "end"


def route_after_correct(state: SuggestionGraphState) -> str:
    """Route after correction attempt."""
    if state['current_stage'] == "validate_schema":
        return "validate_schema"
    if state['current_stage'] == "validate_columns":
        return "validate_columns"
    return "end"


def route_after_retry(state: SuggestionGraphState) -> str:
    """Route after retry decision.

    When the workflow was started with ``dataset_access=True`` the regeneration
    pass should also use the tool-use loop, otherwise we'd silently downgrade
    to metadata-only on retry.
    """
    if state['current_stage'] == "generate":
        return "agent_loop" if state.get("dataset_access") else "generate"
    return "end"


def route_from_start(state: SuggestionGraphState) -> str:
    """Route the workflow entry point based on the dataset_access flag.

    - ``dataset_access=False`` (default): metadata-only path — original behavior.
    - ``dataset_access=True``: agent_loop path — LLM may call read-only tools.
    """
    return "agent_loop" if state.get("dataset_access") else "generate"


# ============= Graph Builder =============

def create_suggestion_graph() -> StateGraph:
    """Create the LangGraph workflow for suggestion generation.

    Constructs a state machine with the following pipeline:
        START --(dataset_access?)-> agent_loop ---+
                |                                  |
                +-> generate ---------------------+--> validate_schema ->
                    ^                                       validate_columns ->
                    |                                       validate_formulas -> END
                    +--- retry <--- correct <-----------------------+

    Nodes:
        - generate: Metadata-only LLM call (privacy ON)
        - agent_loop: LLM ↔ DataFrame-tool round-trip (privacy OFF)
        - validate_schema: Pydantic model validation
        - validate_columns: Check column references exist
        - validate_formulas: Validate Python formula syntax
        - correct: Ask LLM to fix validation errors
        - retry: Full regeneration fallback

    Returns:
        Configured StateGraph ready to be compiled and invoked.
    """
    # Create graph with state schema
    graph = StateGraph(SuggestionGraphState)

    # Add nodes
    graph.add_node("generate", generate_suggestions_node)
    graph.add_node("agent_loop", agent_loop_node)
    graph.add_node("validate_schema", validate_schema_node)
    graph.add_node("validate_columns", validate_columns_node)
    graph.add_node("validate_formulas", validate_formulas_node)
    graph.add_node("correct", correct_suggestions_node)
    graph.add_node("retry", retry_node)

    # Conditional START edge: pick metadata-only vs tool-use path based on
    # the per-request dataset_access flag.
    graph.add_conditional_edges(
        START,
        route_from_start,
        {"agent_loop": "agent_loop", "generate": "generate"},
    )
    graph.add_edge("agent_loop", "validate_schema")
    graph.add_edge("generate", "validate_schema")
    
    # Conditional edges
    graph.add_conditional_edges(
        "validate_schema",
        route_after_schema,
        {
            "validate_columns": "validate_columns",
            "correct": "correct",
            "retry": "retry",
            "end": END
        }
    )
    
    graph.add_conditional_edges(
        "validate_columns",
        route_after_columns,
        {
            "validate_formulas": "validate_formulas",
            "correct": "correct",
            "retry": "retry",
            "end": END
        }
    )
    
    graph.add_edge("validate_formulas", END)
    
    graph.add_conditional_edges(
        "correct",
        route_after_correct,
        {
            "validate_schema": "validate_schema",
            "validate_columns": "validate_columns",
            "end": END
        }
    )
    
    graph.add_conditional_edges(
        "retry",
        route_after_retry,
        {
            "generate": "generate",
            "agent_loop": "agent_loop",
            "end": END
        }
    )

    return graph


# ============= Main Entry Point =============

async def run_suggestion_workflow(
    columns: list[dict],
    guidance_text: str,
    api_key: str,
    provider: ProviderType,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    available_viz_types: Optional[list[str]] = None,
    existing_visualizations: Optional[list[str]] = None,
    max_suggestions: int = 5,
    dataset_access: bool = False,
    dataframe: Optional[Any] = None,
    max_tool_iterations: Optional[int] = None,
    idle_timeout_s: Optional[float] = None,
) -> tuple[list[VisualizationSuggestion], list[str]]:
    """
    Run the complete suggestion workflow.

    Args:
        columns: List of column metadata
        guidance_text: User's analysis goals
        api_key: AI provider API key
        provider: AI provider name
        model: Model name to use
        effort: Reasoning effort level ("low", "medium", "high") or None
        available_viz_types: Supported visualization types
        existing_visualizations: Existing chart titles to avoid
        max_suggestions: Maximum suggestions to generate
        dataset_access: When True, route through ``agent_loop_node`` so the
            LLM may iteratively call read-only DataFrame inspection tools.
            Default False preserves the metadata-only behavior bit-for-bit.
        dataframe: pandas DataFrame the bound tools close over. Required
            when ``dataset_access`` is True; ignored otherwise.
        max_tool_iterations: Override for the agent-loop iteration cap. When
            None, uses the module default. Only meaningful when
            ``dataset_access`` is True.
        idle_timeout_s: Override for the per-chunk streaming idle timeout.
            When None, ``ainvoke_timeout_s`` picks the default based on
            effort and tool binding. Resets on every chunk, so a long-
            but-progressing response is never killed.

    Returns:
        Tuple of (validated_suggestions, errors)
    """
    # Initialize state
    state = initialize_state(
        columns=columns,
        guidance_text=guidance_text,
        api_key=api_key,
        provider=provider,
        model=model,
        effort=effort,
        available_viz_types=available_viz_types,
        existing_visualizations=existing_visualizations,
        max_suggestions=max_suggestions,
        dataset_access=dataset_access,
        dataframe=dataframe,
        max_tool_iterations=max_tool_iterations,
        idle_timeout_s=idle_timeout_s,
    )
    # Log workflow start
    debug.workflow_start(provider, model or 'default', guidance_text, len(columns))

    # Create and compile graph
    graph = create_suggestion_graph()
    app = graph.compile()

    # Prefer the API-layer request ID so logs and metrics share a join key.
    # ``new_request_id`` is still the fallback for direct workflow calls
    # (tests, scripts) that bypass the API.
    request_id = ai_request_id.get("") or new_request_id()
    workflow_start = time.monotonic()
    raised_exc: Optional[BaseException] = None
    final_state: dict = {}

    try:
        # Run workflow
        final_state = await app.ainvoke(state)
    except BaseException as exc:
        raised_exc = exc
        raise
    finally:
        # Emit one metrics record per request, on both success and failure.
        # Must not break the suggest flow: swallow any emission error.
        try:
            latency_ms = (time.monotonic() - workflow_start) * 1000
            usage_records = final_state.get('usage_records', []) if final_state else []
            totals = {
                "input_tokens": 0,
                "output_tokens": 0,
                "cache_read_tokens": 0,
                "cache_creation_tokens": 0,
            }
            for u in usage_records:
                for k in totals:
                    totals[k] += int(u.get(k, 0) or 0)

            validated_for_metric = final_state.get('validated_suggestions', []) if final_state else []
            success = raised_exc is None and len(validated_for_metric) > 0
            error_class = None
            if raised_exc is not None:
                err_cls = getattr(raised_exc, 'error_class', None)
                # AIProviderError subclasses carry error_class; others leave it None.
                error_class = err_cls.value if err_cls is not None and hasattr(err_cls, 'value') else None

            record = AIMetricsRecord(
                timestamp=time.time(),
                request_id=request_id,
                provider=provider,
                model=model or "",
                latency_ms=round(latency_ms, 2),
                input_tokens=totals["input_tokens"],
                output_tokens=totals["output_tokens"],
                cache_read_tokens=totals["cache_read_tokens"],
                cache_creation_tokens=totals["cache_creation_tokens"],
                retry_count=(final_state.get('retry_count', 0) if final_state else 0),
                success=success,
                error_class=error_class,
                effort=effort or None,
                num_suggestions=len(validated_for_metric),
                num_ainvoke_calls=len(usage_records),
                tool_calls_made=(final_state.get('tool_calls_made', 0) if final_state else 0),
            )
            await get_collector().record(record)
        except Exception as metric_exc:
            logger.warning("AIMetrics: failed to emit record: %s", metric_exc)

    # Log workflow end
    validated = final_state.get('validated_suggestions', [])
    errors = final_state.get('validation_errors', [])

    # Deduplicate suggestions by (title, x_axis, y_axes) key
    seen = set()
    unique = []
    for s in validated:
        key = (s.title, s.x_axis, tuple(sorted(s.y_axes)))
        if key not in seen:
            seen.add(key)
            unique.append(s)
    validated = unique

    debug.workflow_end(len(validated), len(errors))

    return (validated, errors)

