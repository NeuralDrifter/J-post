#!/usr/bin/env bash
# Copyright (c) 2026 Michael P. Burgus (https://github.com/NeuralDrifter)
# SPDX-License-Identifier: MIT
#
# Copies Reactive Resume's engine packages into frontend/src/vendor/reactive-resume,
# drops the server-only files listed in vendor_reactive_resume.exclude, puts the
# attribution header on every source file, then applies Job Track's local changes
# from vendor_reactive_resume.patch (see UPSTREAM.md for what each one is for).
#
# Usage: bash tools/vendor_reactive_resume.sh <reactive-resume checkout>
set -euo pipefail

upstream=$(cd "$1" && pwd)
cd "$(dirname "$0")/.."
dest=frontend/src/vendor/reactive-resume
packages=(schema resume pdf docx import fonts utils)
commit=$(git -C "$upstream" rev-parse --short=7 HEAD)
header="// Derived from Reactive Resume (https://github.com/reactive-resume/reactive-resume), commit $commit.
// Copyright (c) 2026 Amruth Pillai. SPDX-License-Identifier: MIT"

copy_packages() {
	mkdir -p "$dest"
	for pkg in "${packages[@]}"; do
		rm -rf "${dest:?}/$pkg"
		cp -R "$upstream/packages/$pkg/src" "$dest/$pkg"
	done
	rm -rf "${dest:?}/fixtures"
	cp -R "$upstream/packages/pdf/fixtures" "$dest/fixtures" # the PDF tests read ../fixtures
	cp "$upstream/LICENSE" "$dest/LICENSE"
}

drop_excluded() {
	while read -r path; do
		[ -n "$path" ] && rm -rf "${dest:?}/$path"
	done < tools/vendor_reactive_resume.exclude
}

add_headers() {
	find "$dest" -type f \( -name '*.ts' -o -name '*.tsx' \) | while read -r file; do
		grep -q 'Derived from Reactive Resume' "$file" && continue
		{ printf '%s\n' "$header"; cat "$file"; } > "$file.tmp"
		mv "$file.tmp" "$file"
	done
}

apply_local_changes() {
	git apply --whitespace=nowarn tools/vendor_reactive_resume.patch
}

copy_packages
drop_excluded
add_headers
apply_local_changes
echo "vendored Reactive Resume $commit into $dest"
