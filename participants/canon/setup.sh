#!/usr/bin/env bash
set -euo pipefail

mkdir -p /tmp/canon/@canon
tar -C "$SDD_MOUNT_CANON" --exclude=node_modules --exclude=dist --exclude=.git -cf - . |
  tar -C /tmp/canon/@canon -xf -

cd /tmp/canon/@canon/lang
npm install --no-audit --no-fund
cd /tmp/canon/@canon/studio
npm run install:local
cd /tmp/canon/@canon/cli
npm run install:local
npm link

cd "$SDD_REPO"
canon-cli init --harness "$SDD_PROVIDER"
canon-cli check
