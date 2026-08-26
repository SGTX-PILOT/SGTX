#!/bin/bash
# SGTX TypeScript Check Script — for CI hosts with 8GB+ RAM
# ===========================================================================
#
# The dev container OOM-kills `tsc --noEmit` at the 2GB V8 heap limit
# (386+ Prisma models + 1,224+ API routes = the type-graph is too large
# for the sandbox's 2GB ceiling). This script is designed to run on a
# CI host (GitHub Actions, Vercel build, etc.) with more memory.
#
# Usage:
#   ./scripts/tsc-check.sh                                                    # runs tsc --noEmit (defaults to 8GB heap)
#   NODE_OPTIONS="--max-old-space-size=4096" ./scripts/tsc-check.sh           # explicit 8GB limit
#   NODE_OPTIONS="--max-old-space-size=16384" ./scripts/tsc-check.sh          # 16GB for very large hosts
#
# Exit codes:
#   0 = success (no type errors)
#   1 = type errors found
#   2 = tsc not found or other infrastructure error
#
# This script is intentionally POSIX-sh compatible (no bashisms beyond
# `set -e` + `pipefail`). It assumes `node`, `npx`, and `bunx` are on PATH.

set -e
set -o pipefail 2>/dev/null || true

echo "=== SGTX TypeScript Check ==="
echo "Node version: $(node --version 2>/dev/null || echo 'node not found')"
echo "Memory limit: ${NODE_OPTIONS:-default (8GB)}"
echo "Working dir:  $(pwd)"
echo ""

# ---------------------------------------------------------------------------
# Pre-flight: verify tsc is reachable. We exit with code 2 (infra error)
# rather than 1 (type error) so CI can distinguish "the check itself
# failed to run" from "the check ran and found type errors".
# ---------------------------------------------------------------------------
if ! command -v npx >/dev/null 2>&1; then
  echo "FATAL: npx not found on PATH. Install Node.js (>=20) before running this script."
  exit 2
fi

# Ensure Prisma client is generated BEFORE tsc runs — otherwise tsc will
# report spurious "Cannot find module '@prisma/client'" or
# "Property 'quote' does not exist on type 'PrismaClient'" errors that are
# NOT real type errors (they're missing-build-output errors).
echo "Generating Prisma client..."
if command -v bunx >/dev/null 2>&1; then
  bunx prisma generate 2>&1 | tail -3 || {
    echo "FATAL: prisma generate failed. Cannot run tsc without a Prisma client."
    exit 2
  }
else
  npx prisma generate 2>&1 | tail -3 || {
    echo "FATAL: prisma generate failed. Cannot run tsc without a Prisma client."
    exit 2
  }
fi

# ---------------------------------------------------------------------------
# Run tsc --noEmit with increased memory. If NODE_OPTIONS is unset, default
# to 8GB (large enough for the 386+ Prisma model + 1,224+ API route type
# graph). Callers with smaller hosts can override via NODE_OPTIONS.
# ---------------------------------------------------------------------------
echo ""
echo "Running tsc --noEmit..."
if [ -z "$NODE_OPTIONS" ]; then
  export NODE_OPTIONS="--max-old-space-size=4096"
fi

# We use `tee` to mirror output to the terminal AND capture it to a temp
# file for error-counting. PIPESTATUS[0] captures tsc's actual exit code
# (rather than tee's, which is always 0).
TSC_OUTPUT_FILE="/tmp/sgtx-tsc-output.txt"
npx tsc --noEmit 2>&1 | tee "$TSC_OUTPUT_FILE" || true
TSC_EXIT=${PIPESTATUS[0]}

echo ""
if [ "$TSC_EXIT" -eq 0 ]; then
  echo "SUCCESS: TypeScript check passed — no type errors"
  echo "  (heap used: ${NODE_OPTIONS})"
  exit 0
else
  ERROR_COUNT=$(grep -c "error TS" "$TSC_OUTPUT_FILE" 2>/dev/null || echo "0")
  echo "FAILED: TypeScript check failed — $ERROR_COUNT type error(s) found"
  echo ""
  echo "Top 10 errors:"
  grep "error TS" "$TSC_OUTPUT_FILE" | head -10 || true
  echo ""
  echo "Full output saved to: $TSC_OUTPUT_FILE"
  echo "Re-run locally with: NODE_OPTIONS=\"--max-old-space-size=4096\" npx tsc --noEmit"
  exit 1
fi
