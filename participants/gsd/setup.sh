#!/usr/bin/env bash
set -euo pipefail

cd "$SDD_REPO"
npm install -g --prefix "$HOME/.local" --no-audit --no-fund node@24.21.0 npm@10.9.9
hash -r
npx --yes @opengsd/gsd-core@1.14.0 --"$SDD_PROVIDER" --local
