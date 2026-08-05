#!/usr/bin/env bash
# Installs Spec Kit and lays out its structure in the run's repository.
set -euo pipefail

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

export PATH="$HOME/.local/bin:$PATH"
# Later sandbox commands and the agent itself start their own shells.
for profile in "$HOME/.profile" "$HOME/.bashrc"; do
  grep -qs 'sdd-bench: uv tools' "$profile" 2>/dev/null ||
    printf '# sdd-bench: uv tools\nexport PATH="$HOME/.local/bin:$PATH"\n' >>"$profile"
done

uv tool install specify-cli

cd "$SDD_REPO"
specify init --here --integration claude --script sh --ignore-agent-tools --force
