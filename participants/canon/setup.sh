#!/usr/bin/env bash
# Builds canon from the mounted checkout and lays out its structure in the
# run's repository. The packages are not published: each names its neighbours
# by version, so they are taken from beside the package instead, deepest
# first. A plain `npm install` afterwards would re-resolve those versions
# against the registry and fail — `install:local` is the whole install.
set -euo pipefail

mkdir -p /tmp/canon
tar -C "$SDD_MOUNT_CANON" --exclude=node_modules --exclude=.git -cf - . |
  tar -C /tmp/canon -xf -

cd /tmp/canon/@canon/lang && npm install --no-audit --no-fund
cd /tmp/canon/@canon/studio && npm run install:local
cd /tmp/canon/@canon/cli && npm run install:local && npm link

cd "$SDD_REPO"
canon-cli init --harness claude
