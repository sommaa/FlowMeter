#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

echo -e "${BOLD}Running all tests${RESET}"
echo "================================"

# Backend
echo -e "\n${BOLD}[Backend]${RESET}"
backend/venv/bin/python -m pytest --rootdir=backend -q
BACKEND=$?

# Frontend
echo -e "\n${BOLD}[Frontend]${RESET}"
npx --prefix frontend vitest run --root frontend
FRONTEND=$?

# Summary
echo -e "\n================================"
if [ $BACKEND -eq 0 ] && [ $FRONTEND -eq 0 ]; then
    echo -e "${GREEN}${BOLD}All tests passed${RESET}"
else
    [ $BACKEND -ne 0 ] && echo -e "${RED}Backend: FAILED${RESET}"
    [ $FRONTEND -ne 0 ] && echo -e "${RED}Frontend: FAILED${RESET}"
    exit 1
fi
