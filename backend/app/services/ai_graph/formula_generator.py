"""AI Formula Generator for computed visualization columns.

This module provides AI-powered generation of Python formula expressions
for the formula plot visualization type. Users describe what they want
to compute in natural language, and the AI generates valid Python code
using the col['ColumnName'] syntax.

Features:
    - Natural language to Python formula conversion
    - Column context awareness with data types and statistics
    - Automatic validation and syntax fixing
    - Support for multiple AI providers (OpenAI, Anthropic, Google)

Example user request:
    "Calculate the efficiency as output divided by input"

Generated formula:
    efficiency = col['Output'] / col['Input']
    result = np.where(col['Input'] != 0, efficiency, 0)
"""

import json
import logging
from typing import Any, Optional
from pydantic import BaseModel, Field

from .providers import get_chat_model, ainvoke_timeout_s
from .formula_validator import validate_formula
from .tools import build_dataset_tools
from .errors import AIProviderError, classify_and_wrap
from .graph_parsing import _content_to_text
from .graph_streaming import _call_model

logger = logging.getLogger(__name__)


# Same cap as the suggestion agent loop. Bounds worst-case latency and token
# spend when dataset_access is on; chosen at the same level so users get
# consistent behavior across both AI features.
_FORMULA_MAX_TOOL_ITERATIONS = 8


class ColumnInfo(BaseModel):
    """Column metadata provided to AI for formula generation context.

    Includes data type information and optional statistics to help the AI
    generate appropriate formulas that handle edge cases.

    Attributes:
        name: Exact column name as it appears in the dataset.
        description: User-provided semantic description of the variable.
        data_type: Type classification (numeric, datetime, categorical).
        stats: Optional statistical summary with min, max, mean, std values.
    """
    name: str = Field(..., description="Column name")
    description: str = Field(default="", description="User-provided description")
    data_type: str = Field(default="numeric", description="Data type: numeric, datetime, categorical")
    stats: Optional[dict] = Field(default=None, description="Statistical summary {min, max, mean, std}")


class FormulaGenerateRequest(BaseModel):
    """Request payload for AI formula generation.

    Attributes:
        columns: List of columns available for use in the formula.
        description: Natural language description of the desired calculation.
    """
    columns: list[ColumnInfo] = Field(..., description="Columns available for the formula")
    description: str = Field(..., description="User's description of what to compute")


FORMULA_SYSTEM_PROMPT = """You are an expert Python data analyst. Your task is to generate Python formula expressions for data visualization.

## Formula Syntax Rules

1. **Column Access**: Use `col['ColumnName']` to access columns from the dataset. `col` is a pandas DataFrame.
2. **Libraries Available**: `np` (numpy), `pd` (pandas) are pre-imported and available.
3. **Result Assignment**: Assign your result(s) to `result`, or for multiple outputs use `result1`, `result2`, etc.
4. **Data Types**: Columns are pandas Series, so you can use vectorized operations.

## Code Style

- Write clear, well-commented Python code.
- Use meaningful variable names for intermediate calculations.
- Include comments explaining the logic.
- Handle edge cases where appropriate (e.g., use `np.where` for division by zero).

## Example Formulas

### Single result:
```python
# Calculate efficiency ratio
efficiency = col['Output'] / col['Input']
# Handle potential division by zero
result = np.where(col['Input'] != 0, efficiency, 0)
```

### Multiple results:
```python
# Calculate moving averages
result1 = col['Value'].rolling(window=10).mean()  # 10-point MA
result2 = col['Value'].rolling(window=50).mean()  # 50-point MA
```

### Complex calculation:
```python
# Normalize the signal to 0-1 range
signal = col['Measurement']
min_val = signal.min()
max_val = signal.max()
result = (signal - min_val) / (max_val - min_val + 1e-10)  # Add small value to avoid div/0
```

### Mathematical functions:
```python
# Use numpy functions for math
result = np.sqrt(col['X']**2 + col['Y']**2)  # Euclidean distance
# result = np.log(col['Value'])  # Natural log
# result = np.exp(-col['Decay'] * col['Time'])  # Exponential decay
```

## Important Rules

1. ONLY use columns that are provided in the context.
2. Always assign to `result` or `result1`, `result2`, etc.
3. Use `col['exact_column_name']` with exact column names from the provided list.
4. Use `**` for power (NOT `^`).
5. Do NOT include any imports - `np` and `pd` are already available.
6. Do NOT use `print()`, `eval()`, `exec()`, `import`, or `open()`.
7. Output ONLY the Python code, no markdown code blocks or explanations outside comments.
"""


def _build_user_prompt(columns: list[ColumnInfo], description: str) -> str:
    """Build the user prompt with column context for formula generation.

    Formats column metadata into a structured prompt section that includes
    column names, data types, descriptions, and statistics.

    Args:
        columns: List of ColumnInfo with metadata about available columns.
        description: User's natural language description of the formula.

    Returns:
        Formatted prompt string with column context and user request.
    """
    # Build column info section
    col_lines = []
    for col in columns:
        line = f"- `{col.name}` ({col.data_type})"
        if col.description:
            line += f": {col.description}"
        if col.stats:
            stats_str = ", ".join(f"{k}={v:.2f}" if isinstance(v, float) else f"{k}={v}" 
                                   for k, v in col.stats.items() if v is not None)
            if stats_str:
                line += f" [Stats: {stats_str}]"
        col_lines.append(line)
    
    columns_section = "\n".join(col_lines)
    
    return f"""## Available Columns

{columns_section}

## User Request

{description}

## Your Task

Generate a Python formula that accomplishes the user's request using ONLY the columns listed above.
Remember:
- Use `col['ColumnName']` syntax for column access
- Assign result to `result` (or `result1`, `result2` for multiple outputs)
- Include helpful comments
- Output ONLY the Python code
"""


_FORMULA_TOOL_USE_BLOCK = """
## Dataset Inspection Tools (READ-ONLY)

The user has granted you read-only access to the dataset. Before producing
the final formula, you MAY call any of these tools to inspect the data:

- `schema()` — list every column with its dtype and the row count
- `describe(column)` — descriptive statistics for one column
- `value_counts(column, top_k=20)` — most frequent values with counts
- `sample(n=5)` — random rows (capped at 10)
- `head(n=5)` — first rows of the dataset (capped at 10)
- `correlation(col1, col2)` — Pearson r between two numeric columns
- `null_counts()` — null counts per column
- `groupby_agg(group_col, agg_col, op="mean", top_k=20)` — aggregate one
  column grouped by another
- `top_correlations(target, k=5)` — top numeric columns by |Pearson r| with target
- `time_range(column)` — min/max/span/inferred frequency for a datetime column
- `quantile(column, q=0.5)` — a single percentile of a numeric column
- `outlier_count(column, method="iqr", k=1.5)` — count outliers (IQR or z-score)

### Tool-use protocol
1. Call tools only when their result will affect the formula (e.g. check for
   nulls before dividing, check the value range before normalizing).
2. There is a hard cap on tool calls per request — when you have enough
   information, STOP calling tools and emit ONLY the final Python formula
   in the format described above (no markdown, no commentary).
3. If a tool returns a string starting with `ERROR:`, adjust your next call.
"""


def _strip_code_fences(code: str) -> str:
    """Strip surrounding ```python ... ``` fences from an LLM response."""
    code = code.strip()
    if code.startswith("```python"):
        code = code[9:]
    elif code.startswith("```"):
        code = code[3:]
    if code.endswith("```"):
        code = code[:-3]
    return code.strip()


async def _run_formula_agent_loop(
    llm,
    system_prompt: str,
    user_prompt: str,
    dataframe,
    *,
    provider: str,
    api_key: str,
    idle_timeout_s: float,
    max_iterations: int = _FORMULA_MAX_TOOL_ITERATIONS,
) -> str:
    """Run the LLM ↔ tools loop and return the final assistant text.

    Mirrors ``agent_loop_node`` in graph.py but inlined here because the
    formula generator returns a plain code string rather than structured
    suggestion JSON, so the rest of the orchestration differs.

    Every model call goes through :func:`_call_model` (not a raw ``ainvoke``)
    so the formula path gets the same reliability policy as the suggestion
    path: progress-aware streaming idle timeout, one transient retry with
    backoff on rate-limit / provider-unavailable, typed ``AIProviderError``
    classification, and API-key redaction.
    """
    from langchain_core.messages import HumanMessage, ToolMessage

    tools = build_dataset_tools(dataframe)
    tool_map = {t.name: t for t in tools}
    bound_llm = llm.bind_tools(tools)

    messages: list = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    iterations = 0
    final_content = ""

    while iterations < max_iterations:
        iterations += 1
        response = await _call_model(
            bound_llm,
            messages,
            provider=provider,
            api_key=api_key,
            idle_timeout_s=idle_timeout_s,
        )
        messages.append(response)

        tool_calls = getattr(response, "tool_calls", None) or []
        if not tool_calls:
            # Use the canonical normalizer so Anthropic thinking-block lists
            # AND OpenAI Responses-API output items are both flattened to text
            # (the inline copy this replaced only handled the Anthropic shape).
            final_content = _content_to_text(response.content or "")
            break

        logger.info(
            "Formula agent loop iter %d: model requested %d tool call(s)",
            iterations,
            len(tool_calls),
        )

        for tc in tool_calls:
            if isinstance(tc, dict):
                name = tc.get("name")
                args = tc.get("args") or {}
                tc_id = tc.get("id")
            else:
                name = getattr(tc, "name", None)
                args = getattr(tc, "args", {}) or {}
                tc_id = getattr(tc, "id", None)

            tool_obj = tool_map.get(name)
            if tool_obj is None:
                result_content = f"ERROR: unknown tool '{name}'"
            else:
                try:
                    result_content = await tool_obj.ainvoke(args)
                except Exception as exc:
                    result_content = f"ERROR: tool '{name}' raised: {exc}"

            if not isinstance(result_content, str):
                try:
                    result_content = json.dumps(result_content, default=str)
                except Exception:
                    result_content = str(result_content)

            messages.append(
                ToolMessage(content=result_content, tool_call_id=tc_id, name=name or "")
            )
    else:
        # Cap hit while still calling tools — force final answer with the
        # unbound model so it cannot request more tools.
        logger.warning(
            "Formula agent loop hit cap=%d; forcing final code", max_iterations
        )
        messages.append(
            HumanMessage(
                content=(
                    "Tool call cap reached. Stop calling tools and emit ONLY "
                    "the final Python formula code, no markdown, no commentary."
                )
            )
        )
        response = await _call_model(
            llm,
            messages,
            provider=provider,
            api_key=api_key,
            idle_timeout_s=idle_timeout_s,
        )
        final_content = _content_to_text(response.content or "")

    return final_content


async def generate_formula(
    provider_name: str,
    api_key: str,
    columns: list[ColumnInfo],
    description: str,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    dataset_access: bool = False,
    dataframe: Optional[Any] = None,
) -> str:
    """
    Generate a formula expression using AI.

    Args:
        provider_name: AI provider ('gemini', 'openai', 'claude')
        api_key: API key for the provider
        columns: List of column information for context
        description: User's description of what to compute
        model: Optional specific model to use
        effort: Reasoning effort level or None
        dataset_access: When True, the AI may issue read-only tool calls
            against the supplied DataFrame before producing the final formula.
            Default False uses the existing metadata-only single-shot path.
        dataframe: pandas DataFrame the bound tools close over. Required when
            ``dataset_access`` is True; ignored otherwise.

    Returns:
        Generated Python formula code

    Raises:
        AIProviderError: A typed provider failure (invalid key, rate-limit,
            quota, timeout, provider-unavailable, or unknown) so the API
            layer can map ``error_class`` to the right HTTP status — the same
            structured contract as the suggestion path.
    """
    logger.info(
        f"Generating formula with {provider_name}, {len(columns)} columns "
        f"(dataset_access={dataset_access})"
    )

    # Get LLM
    llm = get_chat_model(provider_name, api_key, model=model, effort=effort)

    # Build prompts. When dataset_access is on, append the tool-use protocol
    # block to the system prompt so the model knows it can probe the data.
    system_prompt = FORMULA_SYSTEM_PROMPT
    if dataset_access and dataframe is not None:
        system_prompt = FORMULA_SYSTEM_PROMPT + _FORMULA_TOOL_USE_BLOCK
    user_prompt = _build_user_prompt(columns, description)

    # Generate
    try:
        if dataset_access and dataframe is not None:
            # Tool-bound path: longer idle budget (tool schemas + dataset
            # metadata ride along on every turn). Resets per streamed chunk.
            idle_timeout_s = ainvoke_timeout_s(
                provider_name, effort, tools_bound=True
            )
            generated_code = await _run_formula_agent_loop(
                llm=llm,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                dataframe=dataframe,
                provider=provider_name,
                api_key=api_key,
                idle_timeout_s=idle_timeout_s,
            )
        else:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
            # Single-shot path through _call_model: progress-aware idle
            # timeout, one transient retry, typed errors, key redaction.
            idle_timeout_s = ainvoke_timeout_s(provider_name, effort)
            response = await _call_model(
                llm,
                messages,
                provider=provider_name,
                api_key=api_key,
                idle_timeout_s=idle_timeout_s,
            )
            # Canonical normalizer handles plain strings, Anthropic thinking
            # blocks, and OpenAI Responses-API output items uniformly.
            generated_code = _content_to_text(response.content or "")

        generated_code = _strip_code_fences(generated_code)
        
        # Validate the formula
        valid_columns = {col.name for col in columns}
        validation_result, fixed_code = validate_formula(
            generated_code, 
            valid_columns,
            auto_fix=True
        )
        
        if not validation_result.is_valid:
            error_msgs = [f"{e.field}: {e.error}" for e in validation_result.errors]
            logger.warning(f"Generated formula has validation errors: {error_msgs}")
            # Still return the code, but with a warning - let the user fix it
            # The frontend will show validation errors when they try to run it
        
        # Use fixed code if available
        final_code = fixed_code if fixed_code else generated_code
        
        logger.info(f"Generated formula: {len(final_code)} chars")
        return final_code
        
    except AIProviderError:
        # Typed provider failures (invalid key, rate-limit, quota, timeout,
        # provider-unavailable) must reach the API layer intact so it can map
        # error_class → the correct HTTP status, exactly like /ai/suggest.
        # Collapsing them into a generic ValueError would mask every provider
        # error as a 400 and silently break the structured-error contract the
        # /ai/generate-formula endpoint documents.
        raise
    except Exception as e:
        logger.error(f"Formula generation failed: {e}", exc_info=True)
        # Classify provider SDK exceptions (anthropic.RateLimitError, google
        # 429s wrapped by langchain, httpx timeouts, …) into a typed error so
        # the endpoint returns the same {error_class, message, …} detail as the
        # suggest path. api_key is passed so any echoed key is redacted here.
        raise classify_and_wrap(
            e, provider=provider_name, api_key=api_key
        ) from e
