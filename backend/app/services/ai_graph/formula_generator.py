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

import logging
from typing import Optional
from pydantic import BaseModel, Field

from .providers import get_chat_model
from .formula_validator import validate_formula, fix_common_syntax_errors

logger = logging.getLogger(__name__)


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


async def generate_formula(
    provider_name: str,
    api_key: str,
    columns: list[ColumnInfo],
    description: str,
    model: Optional[str] = None,
    effort: Optional[str] = None
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

    Returns:
        Generated Python formula code

    Raises:
        ValueError: If generation fails or formula is invalid
    """
    logger.info(f"Generating formula with {provider_name}, {len(columns)} columns")

    # Get LLM
    llm = get_chat_model(provider_name, api_key, model=model, effort=effort)
    
    # Build prompts
    system_prompt = FORMULA_SYSTEM_PROMPT
    user_prompt = _build_user_prompt(columns, description)
    
    # Generate
    try:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        response = await llm.ainvoke(messages)
        generated_code = response.content.strip()
        
        # Clean up response - remove markdown code blocks if present
        if generated_code.startswith("```python"):
            generated_code = generated_code[9:]
        elif generated_code.startswith("```"):
            generated_code = generated_code[3:]
        if generated_code.endswith("```"):
            generated_code = generated_code[:-3]
        generated_code = generated_code.strip()
        
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
        
    except Exception as e:
        logger.error(f"Formula generation failed: {e}", exc_info=True)
        raise ValueError(f"Failed to generate formula: {str(e)}")
