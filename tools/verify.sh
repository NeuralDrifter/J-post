#!/usr/bin/env bash
# Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
# SPDX-License-Identifier: MIT
#
# One-command check: Go format, vet and tests, Wails bindings, frontend
# type-check, build and tests. Run from anywhere:  bash tools/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."

unformatted=$(gofmt -l $(git ls-files --cached --others --exclude-standard '*.go'))
if [ -n "$unformatted" ]; then
	echo "gofmt needed:"; echo "$unformatted"; exit 1
fi
go vet ./...
go test ./...
quiet() { local out; out=$("$@" 2>&1) || { echo "$out"; echo "FAILED: $*"; return 1; }; }
quiet wails generate module
(cd frontend && quiet npm run build && npx vitest run)
echo "verify: all green"
