#!/usr/bin/env bash
# Counts the Convex function calls the dev deployment runs over a window (FEE-51).
# Usage: scripts/measure-calls.sh [seconds=300] [label]
# Prints calls per function (and how many were served from cache), then the total.
set -euo pipefail
SECONDS_TO_RUN="${1:-300}"
LABEL="${2:-window}"
OUT="$(mktemp -t convex-calls).jsonl"
bunx convex logs --success --jsonl >"$OUT" 2>/dev/null &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
sleep "$SECONDS_TO_RUN"
kill "$PID" 2>/dev/null || true
python3 - "$OUT" "$LABEL" "$SECONDS_TO_RUN" <<'PY'
import collections, json, sys
path, label, secs = sys.argv[1], sys.argv[2], int(sys.argv[3])
rows = [json.loads(l) for l in open(path) if l.startswith('{')]
calls = collections.Counter(r['identifier'] for r in rows)
cached = collections.Counter(r['identifier'] for r in rows if r.get('cachedResult'))
print(f"{label}: {len(rows)} calls in {secs}s ({len(rows) * 3600 / secs:.0f}/hour)")
for name, n in calls.most_common():
    print(f"  {n:5d}  {name}" + (f"  ({cached[name]} cached)" if cached[name] else ""))
PY
