#!/usr/bin/env bash
# Builds canon from the mounted checkout and lays out its structure in the
# run's repository. The packages are not published, so they are built here;
# each depends on the ones beside it, deepest first.
set -euo pipefail

mkdir -p /tmp/canon
tar -C "$SDD_MOUNT_CANON" --exclude=node_modules --exclude=.git -cf - . |
  tar -C /tmp/canon -xf -

npm_install() { npm install --no-audit --no-fund "$@"; }

cd /tmp/canon/@canon/lang && npm_install
cd /tmp/canon/@canon/studio && npm run install:local && npm_install
cd /tmp/canon/@canon/cli && npm run install:local && npm_install && npm link

cd "$SDD_REPO"
canon-cli init --harness claude
