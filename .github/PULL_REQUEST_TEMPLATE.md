<!-- Target the `experimental` branch, not `main`. -->

## Summary

<!-- What does this PR change, and why? -->

## Related issues

<!-- e.g. Closes #123 -->

## Checklist

- [ ] Backend tests pass: `backend/venv/bin/python -m pytest --rootdir=backend -q`
- [ ] Frontend tests pass: `npx --prefix frontend vitest run --root frontend`
- [ ] No ESLint errors: `npm run lint` (from `frontend/`)
- [ ] Type check is clean: `npx tsc --noEmit` (from `frontend/`)
- [ ] New functionality includes tests
- [ ] README updated if a feature or configuration option was added
- [ ] If formula evaluation was touched, user/template paths still route through the sandbox and blacklist tests pass
