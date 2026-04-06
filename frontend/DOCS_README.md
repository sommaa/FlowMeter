# FlowMeter Documentation Generation

This document explains how to generate and view the HTML documentation for the FlowMeter frontend.

## Prerequisites

- Node.js and npm installed
- All dependencies installed (`npm install`)

## Installation

Install TypeDoc (documentation generator):

```bash
npm install --save-dev typedoc
```

## Generate Documentation

Run one of the following commands from the `frontend/` directory:

### Option 1: Generate Documentation Only
```bash
npm run docs
```

This will generate HTML documentation in the `frontend/docs/` directory.

### Option 2: Generate and Serve Documentation
```bash
npm run docs:serve
```

This will:
1. Generate the documentation
2. Start a local web server on port 8080
3. Open your browser to http://localhost:8080

## View Documentation

After generating the docs, you can:

1. **Open directly**: Open `frontend/docs/index.html` in your browser
2. **Use local server**: Run `npm run docs:serve`
3. **Use any HTTP server**:
   ```bash
   cd docs
   python3 -m http.server 8080
   # Then visit http://localhost:8080
   ```

## Documentation Structure

The generated documentation includes:

- **Modules**: All source files organized by directory
- **Classes**: React components and TypeScript classes
- **Interfaces**: TypeScript type definitions
- **Functions**: Standalone functions and hooks
- **Variables**: Constants and exported values

### Main Sections

- **Components**: All React components (UI, features, layout, common)
- **Hooks**: Custom React hooks (`useSidebarResize`, `useThemeEffect`, etc.)
- **Store**: Zustand store slices and state management
- **Types**: TypeScript type definitions and interfaces
- **Services**: API clients and service modules
- **Utilities**: Helper functions and utilities

## Configuration

Documentation generation is configured in `typedoc.json`. Key settings:

- **Entry Point**: `src/` directory
- **Output Directory**: `docs/`
- **Exclusions**: Test files, node_modules
- **Theme**: Default TypeDoc theme
- **Categories**: Organized by component type

## Updating Documentation

When you add or modify JSDoc comments in the code:

1. Make your code changes
2. Add/update JSDoc comments
3. Run `npm run docs` to regenerate

## CI/CD Integration

To generate documentation in your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Generate Documentation
  run: |
    cd frontend
    npm ci
    npm run docs

- name: Deploy Documentation
  # Deploy the frontend/docs/ directory to your hosting service
```

## Documentation Style Guide

All documentation follows these conventions:

### TypeScript/React Components
```typescript
/**
 * Brief one-line description of the component.
 *
 * More detailed description explaining the component's purpose,
 * features, and usage patterns.
 *
 * @example
 * ```tsx
 * <ComponentName prop="value" />
 * ```
 */
export const ComponentName: React.FC<Props> = ({ ... }) => {
```

### Functions and Hooks
```typescript
/**
 * Brief description of what the function does.
 *
 * @param paramName - Description of the parameter
 * @returns Description of the return value
 *
 * @example
 * ```tsx
 * const result = functionName(arg);
 * ```
 */
export function functionName(paramName: Type): ReturnType {
```

### Interfaces and Types
```typescript
/**
 * Description of the interface purpose.
 */
export interface InterfaceName {
  /** Description of property */
  propertyName: Type;
}
```

## Troubleshooting

### Documentation not generating?
- Ensure TypeDoc is installed: `npm install --save-dev typedoc`
- Check for TypeScript errors: `npm run build`
- Verify `typedoc.json` exists in the frontend directory

### Missing documentation?
- Ensure JSDoc comments are properly formatted
- Check that files aren't excluded in `typedoc.json`
- Verify exports are public (not private)

### Styling issues?
- Clear the output directory: `rm -rf docs/`
- Regenerate: `npm run docs`
- Try a different browser

## Additional Resources

- [TypeDoc Documentation](https://typedoc.org/)
- [JSDoc Guide](https://jsdoc.app/)
- [TSDoc Standard](https://tsdoc.org/)
