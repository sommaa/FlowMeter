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
import os
import re
import time
from typing import Any, Optional

from langgraph.graph import StateGraph, START, END

from .schemas import (
    VisualizationSuggestion,
    SuggestionGraphState,
    ColumnMetadata,
    AdditionalConfig,
    FormulaConfig,
)
from .providers import get_chat_model, ProviderType
from .prompts import get_system_prompt, get_user_prompt, get_correction_prompt
from .validators import validate_suggestion_complete
from .formula_validator import validate_formula


logger = logging.getLogger(__name__)


# ============= Debug Configuration =============

class DebugLevel:
    """Debug verbosity levels for AI suggestion workflow."""
    OFF = 0       # No debug output
    SUMMARY = 1   # Phase transitions and final results
    STANDARD = 2  # + Suggestion details and validation results
    VERBOSE = 3   # + Full prompts and LLM responses
    TRACE = 4     # + State snapshots and every function call


def get_debug_level() -> int:
    """Get current debug level from environment."""
    try:
        return int(os.environ.get("AI_DEBUG_LEVEL", "0"))
    except ValueError:
        return DebugLevel.OFF


class AIDebugLogger:
    """
    Structured debug logging for AI suggestion workflow.
    
    Provides formatted, hierarchical output for understanding
    the AI pipeline behavior at various detail levels.
    
    Note: Debug level is read dynamically from AI_DEBUG_LEVEL env var
    on each log call to allow changing it at runtime.
    """
    
    PREFIX = "[AI-DEBUG]"
    LINE_SINGLE = "─" * 70
    LINE_DOUBLE = "═" * 70
    
    def __init__(self):
        self._phase_start_time: Optional[float] = None
        self._workflow_start_time: Optional[float] = None
    
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
        self._workflow_start_time = time.time()
        self._log(self.LINE_DOUBLE)
        self._log("🚀 AI SUGGESTION WORKFLOW STARTED")
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
        elapsed = time.time() - self._workflow_start_time if self._workflow_start_time else 0
        self._log(self.LINE_DOUBLE)
        self._log(f"✅ WORKFLOW COMPLETE in {elapsed:.2f}s")
        self._log(f"  Validated suggestions: {num_validated}")
        self._log(f"  Validation errors: {num_errors}")
        self._log(self.LINE_DOUBLE)
    
    def phase_start(self, phase_name: str, context: Optional[dict] = None) -> None:
        """Log the start of a pipeline phase."""
        if self.level < DebugLevel.SUMMARY:
            return
        self._phase_start_time = time.time()
        self._log("")
        self._log(f"▶ PHASE: {phase_name}")
        self._log(self.LINE_SINGLE)
        if context and self.level >= DebugLevel.STANDARD:
            for key, value in context.items():
                self._log(f"  {key}: {value}", DebugLevel.STANDARD)
    
    def phase_end(self, phase_name: str, result: Optional[str] = None) -> None:
        """Log the end of a pipeline phase."""
        if self.level < DebugLevel.SUMMARY:
            return
        elapsed = time.time() - self._phase_start_time if self._phase_start_time else 0
        self._log(f"◀ {phase_name} completed in {elapsed:.3f}s")
        if result:
            self._log(f"  Result: {result}")
    
    def log_prompt(self, prompt_type: str, content: str, max_chars: int = 500) -> None:
        """Log a prompt (system or user) with optional truncation."""
        if self.level < DebugLevel.VERBOSE:
            return
        self._log(self.LINE_SINGLE, DebugLevel.VERBOSE)
        self._log(f"📝 {prompt_type.upper()} PROMPT:", DebugLevel.VERBOSE)
        truncated = content[:max_chars] + "..." if len(content) > max_chars else content
        for line in truncated.split('\n'):
            self._log(f"  | {line}", DebugLevel.VERBOSE)
    
    def log_llm_response(self, content: str, max_chars: int = 1000) -> None:
        """Log raw LLM response."""
        if self.level < DebugLevel.VERBOSE:
            return
        self._log(self.LINE_SINGLE, DebugLevel.VERBOSE)
        self._log(f"🤖 LLM RAW RESPONSE ({len(content)} chars):", DebugLevel.VERBOSE)
        truncated = content[:max_chars] + "..." if len(content) > max_chars else content
        for line in truncated.split('\n')[:30]:  # Limit lines
            self._log(f"  | {line}", DebugLevel.VERBOSE)
    
    def log_json_parse(self, success: bool, num_items: int = 0, error: str = "") -> None:
        """Log JSON parsing attempt."""
        if self.level < DebugLevel.STANDARD:
            return
        if success:
            self._log(f"  ✓ JSON parsed: {num_items} item(s)", DebugLevel.STANDARD)
        else:
            self._log(f"  ✗ JSON parse failed: {error}", DebugLevel.STANDARD)
    
    def log_suggestion(self, index: int, raw: dict, parsed: bool = True) -> None:
        """Log a single suggestion with details."""
        if self.level < DebugLevel.STANDARD:
            return
        title = raw.get('title', 'Untitled')
        viz_type = raw.get('viz_type', 'unknown')
        x_axis = raw.get('x_axis', 'N/A')
        y_axes = raw.get('y_axes', [])
        confidence = raw.get('confidence', 0)
        
        status = "✓" if parsed else "✗"
        self._log(f"  {status} [{index}] \"{title}\" ({viz_type})", DebugLevel.STANDARD)
        self._log(f"       x_axis: {x_axis}", DebugLevel.STANDARD)
        self._log(f"       y_axes: {y_axes}", DebugLevel.STANDARD)
        self._log(f"       confidence: {confidence}", DebugLevel.STANDARD)
        
        # Log additional config at VERBOSE level
        if self.level >= DebugLevel.VERBOSE:
            additional = raw.get('additional_config', {})
            if additional:
                self._log(f"       additional_config: {json.dumps(additional, default=str)[:200]}", DebugLevel.VERBOSE)
            formula = additional.get('formula', '')
            if formula:
                formula_str = formula.get('input', formula) if isinstance(formula, dict) else str(formula)
                self._log(f"       formula: {formula_str[:100]}", DebugLevel.VERBOSE)
    
    def log_validation_error(self, suggestion_title: str, field: str, error: str, suggestion_fix: str = "") -> None:
        """Log a validation error."""
        if self.level < DebugLevel.STANDARD:
            return
        self._log(f"  ✗ VALIDATION ERROR: {suggestion_title}", DebugLevel.STANDARD)
        self._log(f"       Field: {field}", DebugLevel.STANDARD)
        self._log(f"       Error: {error}", DebugLevel.STANDARD)
        if suggestion_fix:
            self._log(f"       Suggestion: {suggestion_fix}", DebugLevel.STANDARD)
    
    def log_validation_result(self, title: str, is_valid: bool, errors: list = None) -> None:
        """Log overall validation result for a suggestion."""
        if self.level < DebugLevel.STANDARD:
            return
        if is_valid:
            self._log(f"  ✓ VALID: {title}", DebugLevel.STANDARD)
        else:
            self._log(f"  ✗ INVALID: {title} ({len(errors or [])} errors)", DebugLevel.STANDARD)
            for err in (errors or []):
                self._log(f"       - {err}", DebugLevel.STANDARD)
    
    def log_schema_validation(self, index: int, raw: dict, success: bool, error: str = "") -> None:
        """Log Pydantic schema validation attempt."""
        if self.level < DebugLevel.STANDARD:
            return
        title = raw.get('title', f'Suggestion {index}')
        if success:
            self._log(f"  ✓ Schema valid: {title}", DebugLevel.STANDARD)
        else:
            self._log(f"  ✗ Schema invalid: {title}", DebugLevel.STANDARD)
            self._log(f"       Error: {error[:200]}", DebugLevel.STANDARD)
    
    def log_column_check(self, column: str, exists: bool, suggested: str = "") -> None:
        """Log a column existence check."""
        if self.level < DebugLevel.VERBOSE:
            return
        if exists:
            self._log(f"       ✓ Column exists: {column}", DebugLevel.VERBOSE)
        else:
            msg = f"       ✗ Column missing: {column}"
            if suggested:
                msg += f" (did you mean '{suggested}'?)"
            self._log(msg, DebugLevel.VERBOSE)
    
    def log_formula_validation(self, formula: str, is_valid: bool, fixed: str = "", errors: list = None) -> None:
        """Log formula validation result."""
        if self.level < DebugLevel.STANDARD:
            return
        self._log(f"  Formula: {formula[:80]}...", DebugLevel.STANDARD)
        if is_valid:
            self._log(f"  ✓ Formula valid", DebugLevel.STANDARD)
            if fixed != formula:
                self._log(f"       Auto-fixed to: {fixed[:80]}...", DebugLevel.STANDARD)
        else:
            self._log(f"  ✗ Formula invalid", DebugLevel.STANDARD)
            for err in (errors or []):
                self._log(f"       - {err}", DebugLevel.STANDARD)
    
    def log_correction_attempt(self, original_title: str, errors: list) -> None:
        """Log a correction attempt."""
        if self.level < DebugLevel.STANDARD:
            return
        self._log(f"  🔧 Correcting: {original_title}", DebugLevel.STANDARD)
        self._log(f"       Errors to fix: {len(errors)}", DebugLevel.STANDARD)
        for err in errors[:3]:  # Limit to 3
            self._log(f"       - {err}", DebugLevel.STANDARD)
    
    def log_correction_result(self, success: bool, new_title: str = "", error: str = "") -> None:
        """Log correction result."""
        if self.level < DebugLevel.STANDARD:
            return
        if success:
            self._log(f"  ✓ Correction successful: {new_title}", DebugLevel.STANDARD)
        else:
            self._log(f"  ✗ Correction failed: {error}", DebugLevel.STANDARD)
    
    def log_state_transition(self, from_stage: str, to_stage: str, reason: str = "") -> None:
        """Log a state transition."""
        if self.level < DebugLevel.SUMMARY:
            return
        self._log(f"  → Transition: {from_stage} → {to_stage}", DebugLevel.SUMMARY)
        if reason and self.level >= DebugLevel.STANDARD:
            self._log(f"       Reason: {reason}", DebugLevel.STANDARD)
    
    def log_state_snapshot(self, state: dict) -> None:
        """Log a complete state snapshot (TRACE level only)."""
        if self.level < DebugLevel.TRACE:
            return
        self._log(self.LINE_SINGLE, DebugLevel.TRACE)
        self._log("📊 STATE SNAPSHOT:", DebugLevel.TRACE)
        for key, value in state.items():
            if key in ('api_key',):  # Skip sensitive fields
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
        self._log(f"  🔄 Retry {attempt}/{max_attempts}", DebugLevel.SUMMARY)
        if reason:
            self._log(f"       Reason: {reason}", DebugLevel.SUMMARY)


# Global debug logger instance
debug = AIDebugLogger()

# Log debug level at module load (always visible if level >= 1)
_startup_level = get_debug_level()
if _startup_level > 0:
    _level_names = {1: "SUMMARY", 2: "STANDARD", 3: "VERBOSE", 4: "TRACE"}
    logger.info(f"[AI-DEBUG] 🔧 Debug level: {_startup_level} ({_level_names.get(_startup_level, 'CUSTOM')})")


# ============= Constants =============

MAX_RETRIES = 3


# ============= State Initialization =============

def initialize_state(
    columns: list[dict],
    guidance_text: str,
    api_key: str,
    provider: str,
    model: Optional[str] = None,
    available_viz_types: Optional[list[str]] = None,
    existing_visualizations: Optional[list[str]] = None,
    max_suggestions: int = 5
) -> SuggestionGraphState:
    """
    Initialize the graph state with input data.
    
    Args:
        columns: List of column metadata dictionaries
        guidance_text: User's analysis goals
        api_key: AI provider API key
        provider: AI provider name
        available_viz_types: Optional list of supported viz types
        existing_visualizations: Optional list of existing chart titles
        max_suggestions: Maximum suggestions to generate
    """
    # Extract column sets by type
    valid_columns = {col['name'] for col in columns}
    numeric_cols = {col['name'] for col in columns if col.get('data_type') == 'numeric'}
    datetime_cols = {col['name'] for col in columns if col.get('data_type') == 'datetime'}
    categorical_cols = {col['name'] for col in columns if col.get('data_type') == 'categorical'}
    
    return SuggestionGraphState(
        columns=columns,
        guidance_text=guidance_text,
        available_viz_types=available_viz_types or [
            "universal", "area", "hist", "box", 
            "regression", "pca", "formula", "correlation",
            "fft", "root_cause"
        ],
        existing_visualizations=existing_visualizations or [],
        max_suggestions=max_suggestions,
        api_key=api_key,
        provider=provider,
        model=model or "",  # Optional model override
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
        current_stage="generate",
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
        # Create chat model (use specified model if provided)
        chat_model = get_chat_model(
            provider=state['provider'],
            api_key=state['api_key'],
            model=state.get('model') or None,
            temperature=0.7
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
        
        # Generate response
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        response = await chat_model.ainvoke(messages)
        content = response.content
        
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
            "current_stage": "validate_schema"
        }
        
    except Exception as e:
        logger.error(f"Error generating suggestions: {e}")
        debug.phase_end("generate_suggestions_node", f"FAILED: {str(e)}")
        return {
            "validation_errors": [f"Generation failed: {str(e)}"],
            "current_stage": "done"
        }


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
    valid_columns = list(state['valid_column_names'])
    
    try:
        # Create chat model
        chat_model = get_chat_model(
            provider=state['provider'],
            api_key=state['api_key'],
            model=state.get('model') or None,
            temperature=0.5  # Lower temperature for corrections
        )
        
        for failed in state['failed_suggestions'][:3]:  # Limit to 3 corrections per round
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
            
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": correction_prompt}
            ]
            
            try:
                response = await chat_model.ainvoke(messages)
                content = response.content
                
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
                    
            except Exception as e:
                errors.append(f"Correction failed: {str(e)}")
                logger.warning(f"Failed to correct suggestion: {e}")
                debug.log_correction_result(success=False, error=str(e))
        
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
        "current_stage": next_stage
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
    """Route after retry decision."""
    if state['current_stage'] == "generate":
        return "generate"
    return "end"


# ============= Graph Builder =============

def create_suggestion_graph() -> StateGraph:
    """Create the LangGraph workflow for suggestion generation.

    Constructs a state machine with the following pipeline:
        START -> generate -> validate_schema -> validate_columns -> validate_formulas -> END
                    ^                              |
                    |                              v
                    +--- retry <--- correct <------+

    Nodes:
        - generate: Call LLM to produce suggestions
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
    graph.add_node("validate_schema", validate_schema_node)
    graph.add_node("validate_columns", validate_columns_node)
    graph.add_node("validate_formulas", validate_formulas_node)
    graph.add_node("correct", correct_suggestions_node)
    graph.add_node("retry", retry_node)
    
    # Add edges
    graph.add_edge(START, "generate")
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
    available_viz_types: Optional[list[str]] = None,
    existing_visualizations: Optional[list[str]] = None,
    max_suggestions: int = 5
) -> tuple[list[VisualizationSuggestion], list[str]]:
    """
    Run the complete suggestion workflow.
    
    Args:
        columns: List of column metadata
        guidance_text: User's analysis goals
        api_key: AI provider API key
        provider: AI provider name
        available_viz_types: Supported visualization types
        existing_visualizations: Existing chart titles to avoid
        max_suggestions: Maximum suggestions to generate
        
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
        available_viz_types=available_viz_types,
        existing_visualizations=existing_visualizations,
        max_suggestions=max_suggestions
    )
    # Log workflow start
    debug.workflow_start(provider, model or 'default', guidance_text, len(columns))
    
    # Create and compile graph
    graph = create_suggestion_graph()
    app = graph.compile()
    
    # Run workflow
    final_state = await app.ainvoke(state)
    
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


# ============= Helper Functions =============

def _parse_json_response(content: str) -> list[dict]:
    """Parse JSON from LLM response, handling various formats.

    Handles multiple common response formats:
    - Direct JSON array
    - JSON object with 'suggestions' key
    - JSON wrapped in markdown code blocks
    - JSON embedded within prose text

    Args:
        content: Raw LLM response text.

    Returns:
        List of suggestion dictionaries, or empty list if parsing fails.
    """
    # Try direct parse
    try:
        data = json.loads(content)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and 'suggestions' in data:
            return data['suggestions']
        return [data]
    except json.JSONDecodeError:
        pass
    
    # Try to extract JSON from markdown code block
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', content)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            if isinstance(data, list):
                return data
            return [data]
        except json.JSONDecodeError:
            pass
    
    # Try to find array brackets - scan backwards from last ']' for matching '['
    end = content.rfind(']')
    if end != -1:
        # Walk backward to find the matching '['
        depth = 0
        for i in range(end, -1, -1):
            if content[i] == ']':
                depth += 1
            elif content[i] == '[':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(content[i:end+1])
                    except json.JSONDecodeError:
                        break
    
    return []


def _parse_suggestion(raw: dict) -> VisualizationSuggestion:
    """Parse a raw dictionary into a validated VisualizationSuggestion.

    Handles various formats the LLM might return, particularly for the
    nested additional_config and formula fields.

    Args:
        raw: Dictionary from JSON parsing of LLM response.

    Returns:
        Validated VisualizationSuggestion Pydantic model.

    Raises:
        ValueError: If required fields are missing or invalid.
        ValidationError: If Pydantic validation fails.
    """
    # Handle additional_config
    additional = raw.get('additional_config', {})
    if isinstance(additional, dict):
        # Handle nested formula config - can be string, dict, or missing
        if 'formula' in additional:
            formula_val = additional['formula']
            if isinstance(formula_val, str) and formula_val.strip():
                # AI provided formula as string - wrap in FormulaConfig
                additional['formula'] = FormulaConfig(input=formula_val)
            elif isinstance(formula_val, dict):
                # AI provided as dict with 'input' key
                additional['formula'] = FormulaConfig(**formula_val)
            else:
                # Empty or None - remove it
                additional.pop('formula', None)
        additional = AdditionalConfig(**additional)
    else:
        additional = AdditionalConfig()
    
    # Build kwargs, only including fields that exist in raw
    # This lets Pydantic's required field validation catch missing fields
    kwargs = {
        'additional_config': additional,
    }
    
    # Required fields - pass directly to let Pydantic validate
    for field in ['title', 'description', 'viz_type', 'x_axis', 'y_axes', 'confidence', 'reasoning']:
        if field in raw:
            kwargs[field] = raw[field]
    
    # Optional fields with defaults
    for field in ['x_label', 'y_label', 'plot_type', 'legend_labels', 'description']:
        if field in raw:
            kwargs[field] = raw[field]
    
    return VisualizationSuggestion(**kwargs)
