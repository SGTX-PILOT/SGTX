#!/usr/bin/env bash
# CERT-32: Secrets scan — rejects committed credentials.
# Invoked by CI (`.github/workflows/ci.yml`) AND by `bun run cert:secrets-scan`.
# Exits non-zero if any source file contains a credential literal.

set -e
cd "$(dirname "$0")/../.."

echo "=== CERT-32 Secrets Scan ==="

# 1. Turso JWT literal
if rg -n 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9\.eyJhIjoicnci' \
        --type-add 'cfg:*.{ts,js,json,sh,env}' -t cfg \
        src/ prisma.config.ts 2>/dev/null; then
  echo "::error::CERT-32 FAIL: Turso JWT literal found in source."
  exit 1
fi

# 2. GitHub PAT
if rg -n 'ghp_[A-Za-z0-9]{36}' src/ prisma.config.ts 2>/dev/null; then
  echo "::error::CERT-32 FAIL: GitHub PAT literal found in source."
  exit 1
fi

# 3. Vercel token
if rg -n 'vcp_[A-Za-z0-9]{40,}' src/ prisma.config.ts 2>/dev/null; then
  echo "::error::CERT-32 FAIL: Vercel token literal found in source."
  exit 1
fi

# 4. AWS access key
if rg -n 'AKIA[0-9A-Z]{16}' src/ prisma.config.ts 2>/dev/null; then
  echo "::error::CERT-32 FAIL: AWS access key literal found in source."
  exit 1
fi

echo "✅ CERT-32: no credential literals found in source."
