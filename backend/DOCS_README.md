# FlowMeter Backend Documentation Generation

This document explains how to generate and view the HTML documentation for the FlowMeter backend API.

## Prerequisites

- Python 3.11+ installed
- All backend dependencies installed (`pip install -r requirements.txt`)

## Installation

Install Sphinx and the Read the Docs theme:

```bash
pip install sphinx sphinx-rtd-theme
```

## Generate Documentation

Run one of the following commands from the `backend/` directory:

### Option 1: Generate Documentation Only
```bash
cd docs
make html
```

This will generate HTML documentation in the `backend/docs/_build/html/` directory.

### Option 2: Using sphinx-build directly
```bash
sphinx-build -b html docs docs/_build/html
```

### Option 3: Windows
```bash
cd docs
make.bat html
```

## View Documentation

After generating the docs, you can:

1. **Open directly**: Open `docs/_build/html/index.html` in your browser
2. **Use a local server**:
   ```bash
   cd docs/_build/html
   python3 -m http.server 8080
   # Then visit http://localhost:8080
   ```

## Documentation Structure

The generated documentation includes:

- **API Routes**: All FastAPI endpoint handlers with request/response schemas
- **Services**: Business logic layer with algorithm documentation
- **Models**: Pydantic schemas, enums, and type definitions
- **Core**: Configuration, middleware, and response utilities

### Main Sections

- **Data Management** (`/api/v1/data`): File upload, dataset CRUD, statistics
- **Visualizations** (`/api/v1/visualizations`): Chart data generation for all supported visualization types
- **Reconciliation** (`/api/v1/reconcile`): Constrained optimization with OSQP
- **Templates** (`/api/v1/templates`): Dashboard configuration persistence
- **Export** (`/api/v1/export`): HTML report generation with embedded charts
- **Models** (`/api/v1/models`): Regression model training and persistence
- **AI Analysis** (`/api/v1/ai`): LangGraph-powered visualization suggestions

## Configuration

Documentation generation is configured in `docs/conf.py`. Key settings:

- **Extensions**: autodoc, napoleon (Google-style), viewcode, intersphinx
- **Theme**: Read the Docs (`sphinx_rtd_theme`)
- **Docstring Style**: Google-style (via `napoleon` extension)
- **Type Hints**: Rendered in parameter descriptions
- **Cross-references**: Linked to Python, pandas, numpy, FastAPI docs

## Updating Documentation

The `services/` and `core/` reference pages auto-discover modules via
recursive `autosummary` (see `docs/_templates/autosummary/module.rst`), so
**new modules under `app/services` and `app/core` are picked up automatically
on the next build — there is no module list to maintain by hand.** The
`api/` and `models/` pages keep curated endpoint/schema tables; update those
only when endpoints or schema groupings change.

When you add or modify docstrings in the code:

1. Make your code changes
2. Add/update Google-style docstrings
3. Run `make html` in the `docs/` directory to regenerate

> The recursive `autosummary` writes generated stub pages into
> `docs/<section>/_autosummary/`. These are build artifacts and are
> gitignored — do not commit them.

## CI/CD Integration

To generate documentation in your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Generate Backend Documentation
  run: |
    cd backend
    pip install -r requirements.txt
    pip install sphinx sphinx-rtd-theme
    sphinx-build -b html docs docs/_build/html

- name: Deploy Documentation
  # Deploy the backend/docs/_build/html/ directory to your hosting service
```

## Documentation Style Guide

All backend documentation follows **Google-style docstrings**:

### Functions
```python
def function_name(param1: Type, param2: Type) -> ReturnType:
    """Brief one-line description.

    More detailed description explaining the purpose,
    algorithm, and important behavior.

    Args:
        param1: Description of param1.
        param2: Description of param2.

    Returns:
        Description of what is returned.

    Raises:
        ExceptionType: When this exception is raised.

    Example:
        >>> function_name("value", 123)
        "expected_result"
    """
```

### Classes
```python
class ClassName:
    """Brief description of the class.

    Detailed description of purpose and behavior.

    Attributes:
        attr1: Description of attribute.
        attr2: Description of attribute.
    """
```

### FastAPI Endpoints
```python
@router.post("/endpoint", response_model=APIResponse)
async def endpoint_name(param: Type):
    """Brief description of the endpoint.

    Args:
        param: Description of the parameter.

    Returns:
        APIResponse with:
            - success: True
            - data: Description of response data

    Raises:
        HTTPException 400: Description of when this error occurs
        HTTPException 404: Description of when this error occurs
    """
```

## Troubleshooting

### Documentation not generating?
- Ensure Sphinx is installed: `pip install sphinx sphinx-rtd-theme`
- Verify all backend dependencies are installed: `pip install -r requirements.txt`
- Check for import errors: `python -c "import app.main"`
- Check `docs/conf.py` exists and `sys.path` points to the backend root

### Missing documentation?
- Ensure docstrings are properly formatted (Google-style)
- Check that modules aren't excluded in `conf.py`
- Verify the module can be imported without errors

### Import errors during build?
- Some modules require optional dependencies (e.g., `langchain`, `osqp`)
- Install all requirements: `pip install -r requirements.txt`
- For partial builds, you can mock missing imports in `conf.py`

## Additional Resources

- [Sphinx Documentation](https://www.sphinx-doc.org/)
- [Napoleon Extension (Google Docstrings)](https://www.sphinx-doc.org/en/master/usage/extensions/napoleon.html)
- [Read the Docs Theme](https://sphinx-rtd-theme.readthedocs.io/)
- [FastAPI OpenAPI Docs](https://fastapi.tiangolo.com/tutorial/metadata/)
