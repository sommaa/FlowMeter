"""
FastAPI routes for dashboard template management.

This module provides REST API endpoints for:
    - Template CRUD operations (create, read, update, delete)
    - Server-side template persistence (JSON files in data/templates/)
    - Template validation and variable extraction
    - Import/export functionality for template sharing

Templates encapsulate complete dashboard configurations including:
    - Multiple visualization definitions
    - Global variables (computed columns)
    - Layout settings and styling
    - Comments and annotations

Endpoints support both:
    - Persistent server-side storage (multi-user shared templates)
    - Client-side download/upload (personal template backups)

Endpoints are grouped under the "Templates" tag in OpenAPI docs.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Body
from fastapi.responses import JSONResponse, FileResponse
import json
import os
import glob
import shutil
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

from app.models.schemas import (
    APIResponse,
    TemplateConfig,
    VisualizationConfig
)
from app.services.formula_safety import (
    assert_formula_safe,
    is_unsafe_allowed,
    UnsafeFormulaError,
)

import logging

router = APIRouter(tags=["Templates"])
logger = logging.getLogger(__name__)


def _collect_template_formulas(template: TemplateConfig) -> List[tuple]:
    """Return ``(location_label, formula)`` pairs that the render paths eval/exec.

    Only the formulas that are actually executed are collected, so saving a
    template does not reject benign placeholder formula text carried by
    non-formula visualizations.
    """
    items: List[tuple] = []

    for gv in template.global_variables:
        if gv.formula and gv.formula.strip():
            items.append((f"global variable '{gv.name}'", gv.formula))

    for i, viz in enumerate(template.visualizations):
        label = viz.title or f"visualization {i + 1}"
        viz_type = viz.viz_type.value if hasattr(viz.viz_type, "value") else str(viz.viz_type)

        if viz_type == "formula" and viz.formula and viz.formula.input and viz.formula.input.strip():
            items.append((f"{label} formula", viz.formula.input))

        x_axis = getattr(viz.axis, "x_axis", None) if viz.axis else None
        if x_axis == "Custom Formula" and viz.formula and viz.formula.x_formula and viz.formula.x_formula.strip():
            items.append((f"{label} X-axis formula", viz.formula.x_formula))

        if viz.kpi and viz.kpi.metrics:
            for metric in viz.kpi.metrics:
                if metric.operation == "formula" and metric.formula and metric.formula.strip():
                    items.append((f"{label} KPI '{metric.label}'", metric.formula))

        reg = viz.regression
        if reg and getattr(reg, "model_type", None) == "custom":
            custom_formula = getattr(reg, "custom_formula", None)
            if custom_formula and custom_formula.strip():
                items.append((f"{label} regression formula", custom_formula))

    return items


def assert_template_formulas_safe(template: TemplateConfig) -> None:
    """Reject a template whose formulas would run disallowed code on render.

    Defense in depth: every formula is also re-validated at evaluation time, but
    rejecting on save/import fails fast and keeps malicious templates out of the
    shared server-side store. Raises HTTPException 400 on the first unsafe formula.

    No-op when the sandbox is opted out (``is_unsafe_allowed()``), so trusted
    templates with non-whitelisted formulas can be saved/imported.
    """
    if is_unsafe_allowed():
        return
    for label, formula in _collect_template_formulas(template):
        try:
            assert_formula_safe(formula)
        except UnsafeFormulaError as exc:
            raise HTTPException(status_code=400, detail=f"Unsafe formula in {label}: {exc}")

# Constants
TEMPLATE_DIR = os.path.join("data", "templates")

def ensure_template_dir():
    """Ensure the template storage directory exists.

    Creates data/templates/ if not present. Called on module init
    and before all template operations to prevent file I/O errors.
    """
    if not os.path.exists(TEMPLATE_DIR):
        os.makedirs(TEMPLATE_DIR, exist_ok=True)

ensure_template_dir()

def get_required_variables(config_data: dict) -> List[str]:
    """Extract dataset columns required by a template configuration.

    Analyzes all visualizations in the template to determine which
    dataset columns are needed. Excludes derived/computed variables:
        - Global variables (computed from formulas)
        - _rec suffix variables (from data reconciliation)

    This list is used for template validation against datasets to
    ensure compatibility before applying a template.

    Args:
        config_data: Template configuration dict with 'visualizations'
                     and optionally 'global_variables'.

    Returns:
        List of required column names from the original dataset.

    Example:
        ```python
        config = {
            "visualizations": [{
                "axis": {"x_axis": "Date", "y_axis": ["Temperature"]},
                "regression": {"predictors": ["Pressure"]}
            }],
            "global_variables": [{"name": "computed_value"}]
        }
        # Returns: ["Date", "Temperature", "Pressure"]
        # Excludes: "computed_value" (global variable)
        ```
    """
    import re as _re

    variables = set()

    # Regex to extract column references from formula strings: col['name'] or col["name"]
    col_ref_pattern = _re.compile(r"""col\[['"](.+?)['"]\]""")

    def _strip_comments(text: str) -> str:
        """Strip Python-style comments from each line of formula text.

        Removes everything after '#' on each line so that commented-out
        column references (e.g. ``# col['OldName']``) are not picked up
        by the col_ref_pattern regex.
        """
        return '\n'.join(
            line.split('#')[0] for line in text.split('\n')
        )

    # Get global variable names to exclude (they are derived, not required)
    # Also extract column references from global variable formulas
    global_var_names = set()
    global_variables = config_data.get('global_variables', [])
    for gv in global_variables:
        if isinstance(gv, dict) and 'name' in gv:
            global_var_names.add(gv['name'])
            # Extract columns referenced in the global variable formula
            gv_formula = gv.get('formula', '')
            if gv_formula:
                for match in col_ref_pattern.findall(_strip_comments(gv_formula)):
                    variables.add(match)
        elif isinstance(gv, str):
            global_var_names.add(gv)

    # Infer from visualizations
    visualizations = config_data.get('visualizations', [])
    for viz in visualizations:
        # X Axis
        if 'axis' in viz and 'x_axis' in viz['axis']:
            val = viz['axis']['x_axis']
            if val and val not in ('Index', 'Custom Formula'):
                variables.add(val)

        # Y Axis
        if 'axis' in viz and 'y_axis' in viz['axis']:
             for val in viz['axis']['y_axis']:
                 if val: variables.add(val)

        # Regression Predictors
        if 'regression' in viz and 'predictors' in viz['regression'] and viz['regression']['predictors']:
             for val in viz['regression']['predictors']:
                 if val: variables.add(val)

        # Formula column references (col['column_name'] patterns)
        # Only extract from formula fields when viz_type is 'formula'.
        # Non-formula viz types carry default placeholder formula text
        # (e.g. "result = col['Tag 1'] ...") that must be ignored.
        if viz.get('viz_type') == 'formula' and 'formula' in viz:
            formula = viz['formula']
            if isinstance(formula, dict):
                # Always extract from the main formula input
                text = formula.get('input')
                if text:
                    for match in col_ref_pattern.findall(_strip_comments(text)):
                        variables.add(match)
                # Only extract from x_formula when x_axis is 'Custom Formula',
                # otherwise x_formula contains a leftover placeholder
                # (e.g. "col['Time'] / 3600") that is not actually used.
                x_axis_val = viz.get('axis', {}).get('x_axis', '')
                if x_axis_val == 'Custom Formula':
                    x_text = formula.get('x_formula')
                    if x_text:
                        for match in col_ref_pattern.findall(_strip_comments(x_text)):
                            variables.add(match)

        # Root cause target and include variables
        if 'root_cause' in viz:
            rc = viz['root_cause']
            if isinstance(rc, dict):
                target = rc.get('target_variable')
                if target:
                    variables.add(target)
                for val in rc.get('include_variables', []):
                    if val:
                        variables.add(val)

    # Filter out derived variables:
    # - _rec suffix from data reconciliation
    # - Global variables (computed from formulas)
    filtered_variables = [
        v for v in variables
        if not v.endswith('_rec') and v not in global_var_names
    ]

    return filtered_variables

class SavedTemplate(BaseModel):
    name: str
    last_modified: str
    created: str
    size_bytes: int
    required_variables: List[str] = []

class SaveTemplateRequest(BaseModel):
    name: str
    config: TemplateConfig
    overwrite: bool = False

@router.get("/list", response_model=APIResponse)
async def list_templates():
    """List all server-side saved templates with metadata.

    Scans data/templates/ directory and returns metadata for each
    template including creation time, size, and required variables.

    Returns:
        APIResponse with data containing list of templates:
            - name: Template identifier
            - last_modified: ISO timestamp of last edit
            - created: ISO timestamp of creation
            - size_bytes: File size
            - required_variables: Dataset columns needed

    Templates are sorted by last_modified descending (newest first).

    Raises:
        HTTPException 500: File system error
    """
    try:
        ensure_template_dir()
        templates = []
        pattern = os.path.join(TEMPLATE_DIR, "*.json")
        for filepath in glob.glob(pattern):
            try:
                stats = os.stat(filepath)
                filename = os.path.basename(filepath)
                name = os.path.splitext(filename)[0]
                
                # Read content to get/calc required keys
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = json.load(f)
                    
                # Handle nested structure if necessary (legacy)
                data_layer = content.get('data', content)
                req_vars = get_required_variables(data_layer)

                templates.append({
                    "name": name,
                    "last_modified": datetime.fromtimestamp(stats.st_mtime).isoformat(),
                    "created": datetime.fromtimestamp(stats.st_ctime).isoformat(),
                    "size_bytes": stats.st_size,
                    "required_variables": req_vars
                })
            except Exception as e:
                logger.warning(f"Error reading template file {filepath}: {e}")
                continue
        
        # Sort by last modified desc
        templates.sort(key=lambda x: x['last_modified'], reverse=True)
        
        return APIResponse(
            success=True,
            data=templates
        )
    except Exception as e:
        logger.error(f"List templates failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save-persistent", response_model=APIResponse)
async def save_persistent_template(request: SaveTemplateRequest):
    """Save a template to server-side persistent storage.

    Stores the template as a JSON file in data/templates/ for
    sharing across users and sessions. Template names are sanitized
    to prevent directory traversal attacks.

    Request body:
        - name: Template name (alphanumeric, spaces, dashes, underscores)
        - config: TemplateConfig object
        - overwrite: Allow replacing existing template (default: false)

    Returns:
        APIResponse with data containing saved template name.

    Raises:
        HTTPException 400: Invalid template name
        HTTPException 409: Template exists and overwrite=false
        HTTPException 500: File write error
    """
    try:
        ensure_template_dir()
        
        safe_name = "".join([c for c in request.name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
        if not safe_name:
             raise HTTPException(status_code=400, detail="Invalid template name")

        # Refuse to persist a shared template containing unsafe formulas.
        assert_template_formulas_safe(request.config)

        filepath = os.path.join(TEMPLATE_DIR, f"{safe_name}.json")
        
        if os.path.exists(filepath) and not request.overwrite:
            raise HTTPException(status_code=409, detail="Template already exists. Set overwrite=True to replace.")
            
        # Ensure created timestamp is set
        if not request.config.created:
            request.config.created = datetime.now()
            
        # Serialize
        data = request.config.model_dump()
        data['created'] = request.config.created.isoformat()
        
        # Calculate and save required variables for faster future access
        data['required_variables'] = get_required_variables(data)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
            
        return APIResponse(
            success=True,
            message=f"Template '{safe_name}' saved successfully",
            data={"name": safe_name}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save {request.name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save template: {str(e)}")

@router.get("/load-persistent/{name}", response_model=APIResponse)
async def load_persistent_template(name: str):
    """
    Load a template from server storage.
    """
    try:
        ensure_template_dir()
        safe_name = "".join([c for c in name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
        filepath = os.path.join(TEMPLATE_DIR, f"{safe_name}.json")
        
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Template not found")
            
        with open(filepath, 'r', encoding='utf-8') as f:
            template_data = json.load(f)
            
        # Compatibility handling (same as load_template)
        if 'data' in template_data and 'version' not in template_data and 'visualizations' not in template_data:
             template_data = template_data['data']

        # Construct response similar to load_template
        return APIResponse(
            success=True,
            data=template_data
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/delete/{name}", response_model=APIResponse)
async def delete_template(name: str):
    """
    Delete a saved template.
    """
    try:
        ensure_template_dir()
        safe_name = "".join([c for c in name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
        filepath = os.path.join(TEMPLATE_DIR, f"{safe_name}.json")
        
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Template not found")
            
        os.remove(filepath)
        
        return APIResponse(
            success=True,
            message=f"Template '{safe_name}' deleted"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RenameTemplateRequest(BaseModel):
    old_name: str
    new_name: str

@router.post("/rename", response_model=APIResponse)
async def rename_template(request: RenameTemplateRequest):
    """
    Rename a saved template.
    """
    try:
        ensure_template_dir()
        
        safe_old_name = "".join([c for c in request.old_name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
        safe_new_name = "".join([c for c in request.new_name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
        
        if not safe_new_name:
             raise HTTPException(status_code=400, detail="Invalid new template name")
             
        old_filepath = os.path.join(TEMPLATE_DIR, f"{safe_old_name}.json")
        new_filepath = os.path.join(TEMPLATE_DIR, f"{safe_new_name}.json")
        
        if not os.path.exists(old_filepath):
            raise HTTPException(status_code=404, detail="Template not found")
            
        if os.path.exists(new_filepath):
            raise HTTPException(status_code=409, detail=f"Template '{safe_new_name}' already exists")
            
        os.rename(old_filepath, new_filepath)
        
        return APIResponse(
            success=True,
            message=f"Template renamed to '{safe_new_name}'",
            data={"name": safe_new_name}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save", response_model=APIResponse)
async def save_template(template: TemplateConfig):
    """
    Save a template configuration (Download as JSON).
    """
    try:
        # Validate template
        if not template.visualizations:
            raise HTTPException(status_code=400, detail="Template must contain at least one visualization")

        # Block download/export of a template carrying unsafe formulas.
        assert_template_formulas_safe(template)

        # Ensure created timestamp is set
        if not template.created:
             template.created = datetime.now()
        
        # Convert to dict for JSON serialization
        template_dict = template.model_dump()
        
        # Handle datetime serialization
        template_dict['created'] = template.created.isoformat()
        
        return APIResponse(
            success=True,
            message="Template prepared for download",
            data=template_dict
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save template: {str(e)}")


@router.post("/load", response_model=APIResponse)
async def load_template(file: UploadFile = File(...)):
    """Load a template from an uploaded JSON file (client-side import).

    Accepts a template JSON file uploaded by the user and parses it
    into a TemplateConfig. Handles legacy format compatibility.

    Args:
        file: Uploaded JSON file (UploadFile from multipart/form-data).

    Returns:
        APIResponse with data containing the parsed template config.

    Raises:
        HTTPException 400: File is not JSON or invalid format
        HTTPException 500: Parse error

    Note:
        This endpoint is for importing templates from external sources
        (user downloads, backups). For server-stored templates, use
        GET /load-persistent/{name} instead.
    """
    if not file.filename or not file.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="File must be a JSON file")
    
    try:
        content = await file.read()
        template_data = json.loads(content.decode('utf-8'))

        # Helper to unwrap "APIResponse" style JSON if user uploaded that
        if 'data' in template_data and 'version' not in template_data:
             template_data = template_data['data']

        # Validate required fields
        if 'visualizations' not in template_data:
            # Try looser validation for older templates? 
            # For now stick to strict.
            if 'version' not in template_data:
                 logger.warning(f"Template '{file.filename}' missing version field")

        return APIResponse(
            success=True,
            message="Template loaded",
            data=template_data
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except Exception as e:
        logger.error(f"Failed to load template: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load template: {str(e)}")


@router.post("/validate", response_model=APIResponse)
async def validate_template(template: TemplateConfig):
    """Validate a template configuration for correctness and completeness.

    Checks for:
        - At least one visualization present
        - Required fields for each visualization type
        - Warnings for missing optional fields (plant_name, titles)

    Request body:
        - template: TemplateConfig object to validate

    Returns:
        APIResponse with data containing:
            - valid: Boolean overall validity
            - errors: List of blocking errors
            - warnings: List of non-blocking warnings
            - visualization_count: Number of visualizations

    Example response:
        ```json
        {
          "success": true,
          "data": {
            "valid": false,
            "errors": ["Visualization 1 (Trend): Y-axis is required"],
            "warnings": ["Plant name is empty"],
            "visualization_count": 2
          }
        }
        ```
    """
    errors = []
    warnings = []
    
    if not template.plant_name:
        warnings.append("Plant name is empty")
    
    if not template.visualizations:
        errors.append("Template must contain at least one visualization")
    
    # Validate each visualization
    for i, viz in enumerate(template.visualizations):
        if not viz.title:
            warnings.append(f"Visualization {i+1} has no title")
        
        if viz.viz_type.value in ['line', 'scatter', 'bar'] and not viz.y_axis:
            errors.append(f"Visualization {i+1} ({viz.title}): Y-axis is required")

    # Surface unsafe formulas as blocking validation errors (unless the sandbox
    # is opted out, in which case such formulas are allowed to run).
    if not is_unsafe_allowed():
        for label, formula in _collect_template_formulas(template):
            try:
                assert_formula_safe(formula)
            except UnsafeFormulaError as exc:
                errors.append(f"Unsafe formula in {label}: {exc}")

    return APIResponse(
        success=len(errors) == 0,
        data={
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "visualization_count": len(template.visualizations)
        }
    )
