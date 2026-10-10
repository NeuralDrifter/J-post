#!/usr/bin/env bash
# Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
# SPDX-License-Identifier: MIT
#
# Regenerates tools/vendor_reactive_resume.patch from the vendored tree as it is
# now: every difference from a pristine copy of upstream becomes the patch.
# Usage: bash tools/vendor_reactive_resume_patch.sh <reactive-resume checkout>
set -euo pipefail
upstream=$(cd "$1" && pwd)
cd "$(dirname "$0")/.."
vendored=frontend/src/vendor/reactive-resume
pristine=.superpowers/vendor-pristine

rm -rf "$pristine"
mkdir -p "$pristine"
cp -R "$vendored" "$pristine/modified"
VENDOR_PRISTINE=1 bash tools/vendor_reactive_resume.sh "$upstream" >/dev/null
cp -R "$vendored" "$pristine/original"
rm -rf "$vendored"
cp -R "$pristine/modified" "$vendored"

# Paths in the patch are relative to the repository root, as git apply expects.
git diff --no-index --no-color "$pristine/original" "$pristine/modified" -- . \
	| sed "s#a/$pristine/original/#a/$vendored/#g; s#b/$pristine/modified/#b/$vendored/#g" \
	> tools/vendor_reactive_resume.patch || true
rm -rf "$pristine"
echo "wrote tools/vendor_reactive_resume.patch ($(grep -c '^diff --git' tools/vendor_reactive_resume.patch) files)"
