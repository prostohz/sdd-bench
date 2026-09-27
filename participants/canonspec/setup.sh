#!/usr/bin/env bash
set -euo pipefail

npm install -g --no-audit --no-fund @canonspec/cli@0.1.1

cd "$SDD_REPO"
canon-cli init --harness "$SDD_PROVIDER"
canon-cli check
