#!/usr/bin/env bash
# Installs OpenSpec and lays out its structure in the run's repository.
set -euo pipefail

npm install -g --no-audit --no-fund @fission-ai/openspec@latest

cd "$SDD_REPO"
openspec init --tools "$SDD_PROVIDER" --force --no-animation
