#!/usr/bin/env bash
# Replaces repos/effect with Effect's source at the installed version's tag (T38).
# Doesn't rely on git-subtree history, which squash-merged PRs (T2) drop. Stages the change; commit it with the bump.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
version=$(node -p "require('effect/package.json').version")
git fetch --depth 1 https://github.com/Effect-TS/effect.git "refs/tags/effect@${version}"
git rm -rq --ignore-unmatch repos/effect
rm -rf repos/effect
git read-tree --prefix=repos/effect -u FETCH_HEAD
echo "repos/effect now matches effect@${version} (staged)."
