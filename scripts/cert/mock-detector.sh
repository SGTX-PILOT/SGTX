#!/usr/bin/env bash
# CERT-27: Mock / placeholder detector — flags production-path mocks.
# Invoked by CI AND by `bun run cert:mock-detector`.

set -e
cd "$(dirname "$0")/../.."

echo "=== CERT-27 Mock / Placeholder Detector ==="
FAIL=0

# 1. "coming soon" / "placeholder" in production UI (visible user-facing text)
if rg -i 'coming soon|placeholder' src/app/page.tsx src/components/portals/ src/components/sgtx/ 2>/dev/null; then
  echo "::error::CERT-27 FAIL: 'coming soon' or 'placeholder' found in production UI."
  FAIL=1
fi

# 2. TODO count (informational — should be ticketed)
TODO_COUNT=$(rg -c 'TODO' src/lib src/app src/components 2>/dev/null | awk -F: '{sum+=$2} END {print sum+0}')
echo "  TODOs in production code: $TODO_COUNT (must be ticketed)"

# 3. setTimeout in API routes (heuristic for fake-async patterns)
FAKE_ASYNC=$(rg -n 'setTimeout\([^,]+,\s*[0-9]+\)' src/app/api/ 2>/dev/null | rg -v 'cron|expir|deferred|retr' 2>/dev/null | wc -l)
echo "  setTimeout in API routes (review): $FAKE_ASYNC"

if [ "$FAIL" -eq 1 ]; then exit 1; fi
echo "✅ CERT-27: no production-path mocks detected."
