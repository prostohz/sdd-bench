#!/usr/bin/env bash
# Installs BMad Method and lays out its structure in the run's repository.
# `--yes` alone still asks for the installation directory, so it is given
# explicitly; the output folder is pinned so the specification has a known
# place to be found in.
set -euo pipefail

cd "$SDD_REPO"
tool="$SDD_PROVIDER"
if [ "$tool" = claude ]; then tool=claude-code; fi
npx --yes bmad-method@latest install \
  --yes \
  --directory "$SDD_REPO" \
  --modules bmm \
  --tools "$tool" \
  --output-folder docs
